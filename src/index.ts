import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";
import { json } from "express";
import { expressMiddleware } from "@apollo/server/express4";
import createServer from "./apollo-server";

(async () => {
    const PORT = Number(process.env.PORT ?? 4000);
    const HOST = process.env.HOST ?? "0.0.0.0"; // important for ECS/ALB

    const allowedOrigins = (
        process.env.ALLOWED_ORIGINS ?? "http://localhost:5173"
    )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    const corsOptions: cors.CorsOptions = {
        origin(origin, cb) {
            if (!origin) return cb(null, true); // allow tools/no-origin
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error(`Origin ${origin} not allowed`));
        },
        credentials: true,
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    };

    const app = express();

    // Health endpoint for ALB
    app.get("/health", (_req: Request, res: Response) =>
        res.status(200).send("ok")
    );

    // Apollo on /graphql
    const apollo = createServer();
    await apollo.start();

    app.options("/graphql", cors(corsOptions));

    app.use(
        "/graphql",
        cors<cors.CorsRequest>(corsOptions),
        json(),
        expressMiddleware(apollo)
    );

    app.listen(PORT, HOST, () => {
        console.log(
            `HTTP listening on http://${HOST}:${PORT}  (GraphQL at /graphql)`
        );
        console.log(
            `Allowed CORS origins: ${
                allowedOrigins.length
                    ? allowedOrigins.join(", ")
                    : "[none configured]"
            }`
        );
    });
})();
