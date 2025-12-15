import Database from "better-sqlite3";
import { readFileSync } from "fs";
import path from "path";

const DB_PATH = "/app/site/build/db-auth/auth.db"; // Make sure this matches Docker volume mount
const SCHEMA_PATH = "/app/site/db-auth/schema.sql";

const db = new Database(DB_PATH);
const schema = readFileSync(SCHEMA_PATH, "utf8");

db.exec(schema);
console.log("✅ Auth DB initialized");
