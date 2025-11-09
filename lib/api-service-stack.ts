// lib/api-service-stack.ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import {
    aws_ec2 as ec2,
    aws_ecs as ecs,
    aws_elasticloadbalancingv2 as elbv2,
    aws_iam as iam,
    aws_logs as logs,
    aws_secretsmanager as secrets,
    aws_cloudwatch as cw,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
    aws_sns_subscriptions as subs,
} from "aws-cdk-lib";

type Props = cdk.StackProps & {
    imageTag: string; // e.g. "latest" or a git SHA
    desiredCount?: number; // default 1
    cpu?: number; // default 256
    memoryMiB?: number; // default 512
};

export class ApiServiceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        // ---- Imports from other stacks (exports) ----
        const vpcId = cdk.Fn.importValue("VersoStat-VpcId");
        const vpcAzs = cdk.Fn.importValue("VersoStat-AvailabilityZones")
            .split(",")
            .map((s) => s.trim());
        const privateSubnetIds = cdk.Fn.importValue(
            "VersoStat-PrivateSubnetIds"
        )
            .split(",")
            .map((s) => s.trim());
        const privateSubnetRouteTableIds = cdk.Fn.importValue(
            "VersoStat-PrivateSubnetRouteTableIds"
        )
            .split(",")
            .map((s) => s.trim());

        const clusterName = cdk.Fn.importValue("VersoStat-ClusterName");
        const clusterArn = cdk.Fn.importValue("VersoStat-ClusterArn");
        const listenerArn = cdk.Fn.importValue("VersoStat-HttpListenerArn");
        const taskSgId = cdk.Fn.importValue("VersoStat-TaskSecurityGroupId");
        const repoUri = cdk.Fn.importValue("VersoStat-EcrRepositoryUri");

        const dbHost = cdk.Fn.importValue("VersoStat-DbHost");
        const dbPort = cdk.Fn.importValue("VersoStat-DbPort");
        const dbSecretArn = cdk.Fn.importValue("VersoStat-DbSecretArn");
        const dbSgId = cdk.Fn.importValue("VersoStat-DbSecurityGroupId");

        // ---- VPC / Cluster from attributes ----
        const vpc = ec2.Vpc.fromVpcAttributes(this, "ImportedVpc", {
            vpcId,
            availabilityZones: vpcAzs,
            privateSubnetIds,
            privateSubnetRouteTableIds,
        });

        const cluster = ecs.Cluster.fromClusterAttributes(
            this,
            "ImportedCluster",
            {
                clusterArn,
                clusterName,
                vpc,
            }
        );

        // ---- SGs from IDs ----
        const taskSg = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            "TaskSg",
            taskSgId
        );
        const dbSg = ec2.SecurityGroup.fromSecurityGroupId(
            this,
            "DbSg",
            dbSgId
        );

        // ---- Imported ALB Listener (IApplicationListener is fine here) ----
        const listenerRefSg = new ec2.SecurityGroup(this, "ListenerRefSg", {
            vpc,
            description: "Placeholder SG for imported ALB listener reference",
            allowAllOutbound: true,
        });

        const listener =
            elbv2.ApplicationListener.fromApplicationListenerAttributes(
                this,
                "ImportedListener",
                { listenerArn, securityGroup: listenerRefSg }
            );

        // ---- Logs ----
        const logGroup = new logs.LogGroup(this, "ApiSvcLogs", {
            retention: logs.RetentionDays.ONE_MONTH,
        });

        // ---- Task Definition / Container ----
        const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
            cpu: props.cpu ?? 256,
            memoryLimitMiB: props.memoryMiB ?? 512,
        });

        taskDef.addToTaskRolePolicy(
            new iam.PolicyStatement({
                actions: [
                    "ssmmessages:CreateControlChannel",
                    "ssmmessages:CreateDataChannel",
                    "ssmmessages:OpenControlChannel",
                    "ssmmessages:OpenDataChannel",
                ],
                resources: ["*"],
            })
        );

        taskDef
            .obtainExecutionRole()
            .addManagedPolicy(
                iam.ManagedPolicy.fromAwsManagedPolicyName(
                    "service-role/AmazonECSTaskExecutionRolePolicy"
                )
            );

        const image = ecs.ContainerImage.fromRegistry(
            `${repoUri}:${props.imageTag}`
        );

        const dbSecret = secrets.Secret.fromSecretCompleteArn(
            this,
            "DbSecret",
            dbSecretArn
        );

        const container = taskDef.addContainer("web", {
            image,
            logging: ecs.LogDriver.awsLogs({ logGroup, streamPrefix: "api" }),
            environment: {
                DB_HOST: dbHost,
                DB_PORT: dbPort,
                DB_NAME: "versostat_db",
                PORT: "4000",

                PGHOST: dbHost,
                PGPORT: dbPort,
                PGDATABASE: "versostat_db",

                dbhost: dbHost,
                dbport: dbPort,
                database: "versostat_db",

                PGSSLMODE: "verify-full", // verify CA + servername
                PGSSLROOTCERT: "/etc/ssl/certs/rds-global-bundle.pem",
                NODE_EXTRA_CA_CERTS: "/etc/ssl/certs/rds-global-bundle.pem",

                ALLOWED_ORIGINS: "https://versostat.com",
            },
            secrets: {
                DB_USER: ecs.Secret.fromSecretsManager(dbSecret, "username"),
                DB_PASSWORD: ecs.Secret.fromSecretsManager(
                    dbSecret,
                    "password"
                ),

                dbuser: ecs.Secret.fromSecretsManager(dbSecret, "username"),
                dbpassword: ecs.Secret.fromSecretsManager(dbSecret, "password"),
            },
            portMappings: [{ containerPort: 4000 }],
        });

        // ---- Fargate Service ----
        const service = new ecs.FargateService(this, "ApiService", {
            cluster,
            taskDefinition: taskDef,
            desiredCount: props.desiredCount ?? 1,
            assignPublicIp: false,
            securityGroups: [taskSg],
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            circuitBreaker: { rollback: true },
            enableExecuteCommand: true,
            healthCheckGracePeriod: cdk.Duration.seconds(60),
        });

        const scaling = service.autoScaleTaskCount({
            minCapacity: 1,
            maxCapacity: 2,
        });

        scaling.scaleOnCpuUtilization("CpuScaling", {
            targetUtilizationPercent: 70, // Aim to keep avg CPU ~70%
            scaleOutCooldown: cdk.Duration.seconds(60),
            scaleInCooldown: cdk.Duration.seconds(120),
        });

        scaling.scaleOnMemoryUtilization("MemScaling", {
            targetUtilizationPercent: 70,
            scaleOutCooldown: cdk.Duration.seconds(60),
            scaleInCooldown: cdk.Duration.seconds(120),
        });

        // Prefer SPOT with on-demand fallback
        const cfnSvc = service.node.defaultChild as ecs.CfnService;
        cfnSvc.launchType = undefined;
        cfnSvc.capacityProviderStrategy = [
            { capacityProvider: "FARGATE_SPOT", weight: 1 },
            { capacityProvider: "FARGATE", weight: 1 },
        ];
        cfnSvc.deploymentConfiguration = {
            minimumHealthyPercent: 100,
            maximumPercent: 200,
        };

        // Ensure subnets are a CFN list (not a single string)
        const privateSubnetIdsToken = cdk.Fn.importValue(
            "VersoStat-PrivateSubnetIds"
        );
        const subnetList = cdk.Fn.split(",", privateSubnetIdsToken);
        cfnSvc.addPropertyOverride(
            "NetworkConfiguration.AwsvpcConfiguration.Subnets",
            subnetList
        );
        cfnSvc.addPropertyOverride(
            "NetworkConfiguration.AwsvpcConfiguration.SecurityGroups",
            [taskSg.securityGroupId]
        );
        cfnSvc.addPropertyOverride(
            "NetworkConfiguration.AwsvpcConfiguration.AssignPublicIp",
            "DISABLED"
        );

        // ---- Target Group on port 4000 + Listener Rule ----
        const tg = new elbv2.ApplicationTargetGroup(this, "ApiTg", {
            vpc,
            targetType: elbv2.TargetType.IP, // Fargate -> IP targets
            port: 4000, // MUST match container port
            protocol: elbv2.ApplicationProtocol.HTTP,
            healthCheck: {
                path: "/health",
                healthyHttpCodes: "200-399",
                interval: cdk.Duration.seconds(15),
                timeout: cdk.Duration.seconds(5),
                healthyThresholdCount: 2,
                unhealthyThresholdCount: 3,
                port: "traffic-port",
            },
            deregistrationDelay: cdk.Duration.seconds(10),
        });

        // Attach the ECS service to the TG explicitly
        service.attachToApplicationTargetGroup(tg);

        // Forward HTTP listener traffic to the TG
        new elbv2.ApplicationListenerRule(this, "ApiRule", {
            listener,
            priority: 10,
            conditions: [elbv2.ListenerCondition.pathPatterns(["/*"])],
            action: elbv2.ListenerAction.forward([tg]),
        });

        // ---- Allow ECS tasks to reach Postgres ----
        dbSg.addIngressRule(
            taskSg,
            ec2.Port.tcp(5432),
            "ECS tasks to RDS 5432"
        );

        const alarmTopic = new sns.Topic(this, "OpsAlarmsTopic", {
            displayName: "VersoStat API Alarms",
        });

        const alarmEmail = process.env.ALARM_EMAIL;
        if (alarmEmail) {
            alarmTopic.addSubscription(new subs.EmailSubscription(alarmEmail));
        }

        const albFullName = cdk.Fn.importValue("VersoStat-AlbFullName");

        // ALB 5XX (load balancer–generated) spike alarm
        const alb5xxAlarm = new cw.Alarm(this, "Alb5xxSpike", {
            alarmDescription: "ALB is returning 5XX errors (spike)",
            metric: new cw.Metric({
                namespace: "AWS/ApplicationELB",
                metricName: "HTTPCode_ELB_5XX_Count",
                dimensionsMap: { LoadBalancer: albFullName },
                statistic: "Sum",
                period: cdk.Duration.minutes(1),
            }),
            threshold: 5, // ≥5 5xx in a minute
            evaluationPeriods: 3, // for 3 consecutive minutes
            datapointsToAlarm: 2, // 2 out of 3 to reduce noise
            treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        });
        alb5xxAlarm.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

        const tgFullName = tg.targetGroupFullName;

        // ALB target group UnhealthyHostCount > 0 (for 5 minutes)
        const unhealthyHostsAlarm = new cw.Alarm(this, "AlbUnhealthyHosts", {
            alarmDescription:
                "ALB target group has 1+ unhealthy targets for 5 minutes",
            metric: new cw.Metric({
                namespace: "AWS/ApplicationELB",
                metricName: "UnHealthyHostCount",
                dimensionsMap: {
                    LoadBalancer: albFullName,
                    TargetGroup: tgFullName,
                },
                statistic: "Average",
                period: cdk.Duration.minutes(1),
            }),
            threshold: 1,
            evaluationPeriods: 5, // 5 consecutive minutes
            datapointsToAlarm: 5,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        });
        unhealthyHostsAlarm.addAlarmAction(
            new cw_actions.SnsAction(alarmTopic)
        );

        // ECS CPU >= 85% for 5 consecutive minutes
        const ecsHighCpu = new cw.Alarm(this, "EcsHighCpu", {
            alarmDescription: "ECS service CPU >= 85% for 5 minutes",
            metric: service.metricCpuUtilization({
                period: cdk.Duration.minutes(1),
                statistic: "Average",
            }),
            threshold: 85,
            evaluationPeriods: 5,
            datapointsToAlarm: 5,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        });
        ecsHighCpu.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

        // ECS Memory >= 85% for 5 consecutive minutes
        const ecsHighMem = new cw.Alarm(this, "EcsHighMem", {
            alarmDescription: "ECS service Memory >= 85% for 5 minutes",
            metric: service.metricMemoryUtilization({
                period: cdk.Duration.minutes(1),
                statistic: "Average",
            }),
            threshold: 85,
            evaluationPeriods: 5,
            datapointsToAlarm: 5,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING,
        });
        ecsHighMem.addAlarmAction(new cw_actions.SnsAction(alarmTopic));

        new cdk.CfnOutput(this, "OpsAlarmsTopicArn", {
            value: alarmTopic.topicArn,
            exportName: "VersoStat-OpsAlarmsTopicArn",
        });

        new cdk.CfnOutput(this, "ServiceName", { value: service.serviceName });
    }
}
