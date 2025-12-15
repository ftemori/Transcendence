import Database from "better-sqlite3";
import { readFileSync } from "fs";
import path from "path";

const DB_PATH = "/app/site/build/db-match/match.db"; // Match your volume mount
const SCHEMA_PATH = "/app/site/db-match/schema.sql";

const db = new Database(DB_PATH);
const schema = readFileSync(SCHEMA_PATH, "utf8");

db.exec(schema);
console.log("✅ Matches DB initialized");

export default db;
