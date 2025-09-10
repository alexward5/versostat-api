import fs from "fs";
import { Pool } from "pg";
import { ConnectionOptions } from "tls";

let ssl: boolean | ConnectionOptions = false;
if (process.env.NODE_ENV === "production") {
    ssl = {
        rejectUnauthorized: true,
        ca: fs
            .readFileSync(
                process.env.PGSSLROOTCERT ||
                    "/etc/ssl/certs/rds-global-bundle.pem"
            )
            .toString(),
    };
}

const pool = new Pool({
    host: process.env.dbhost,
    port: Number(process.env.dbport),
    database: process.env.database,
    user: process.env.dbuser,
    password: process.env.dbpassword,
    ssl: ssl,
    max: 20,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 10000,
});

export default pool;
