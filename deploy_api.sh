#!/usr/bin/env bash
set -euo pipefail

REGION="us-east-1"
STACK="VersoStat-ApiServiceStack-prod"
IMAGE_TAG="latest"

echo "Region:        $REGION"
echo "Image tag:     $IMAGE_TAG"
echo "Service stack: $STACK"

# 1) Get ECR repo URI from CFN export
REPO_URI=$(aws cloudformation list-exports --region "$REGION" \
  --query "Exports[?Name=='VersoStat-EcrRepositoryUri'].Value" --output text)
if [[ -z "$REPO_URI" || "$REPO_URI" == "None" ]]; then
  echo "ERROR: Could not resolve VersoStat-EcrRepositoryUri export"; exit 2
fi
echo "ECR repo URI:  $REPO_URI"

# 2) Build for linux/amd64 (so Fargate can run it) and LOAD the image locally
if ! docker buildx ls >/dev/null 2>&1; then
  docker buildx create --use >/dev/null
fi
docker buildx build --platform linux/amd64 -t "$REPO_URI:$IMAGE_TAG" --load .

# 3) Login + push
aws ecr get-login-password --region "$REGION" \
| docker login --username AWS --password-stdin "$(echo "$REPO_URI" | awk -F/ '{print $1}')"
docker push "$REPO_URI:$IMAGE_TAG"

# 4) (Optional) Deploy the Service stack with IMAGE_TAG=latest if infra changed
# If you didn't change CDK infra, you can comment this out to save time.
export IMAGE_TAG
cdk deploy "$STACK" --require-approval never

# 5) Force a new deployment so ECS tasks pull the new image
CLUSTER=$(aws cloudformation list-exports --region "$REGION" \
  --query "Exports[?Name=='VersoStat-ClusterName'].Value" --output text)
SERVICE=$(aws cloudformation list-stack-resources --stack-name "$STACK" --region "$REGION" \
  --query "StackResourceSummaries[?ResourceType=='AWS::ECS::Service'].PhysicalResourceId" --output text)

aws ecs update-service --cluster "$CLUSTER" --service "$SERVICE" \
  --region "$REGION" --force-new-deployment >/dev/null

echo "Waiting for service to stabilize..."
aws ecs wait services-stable --region "$REGION" --cluster "$CLUSTER" --services "$SERVICE"
echo "Service is stable."

echo "Deployed image: $REPO_URI:$IMAGE_TAG"
