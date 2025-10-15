const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const db = new sqlite3.Database('./db/database.db');

const schema = `
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    item_name TEXT,
    quantity INTEGER,
    rate REAL,
    amount REAL,
    type TEXT,
    party_name TEXT
);
CREATE TABLE IF NOT EXISTS stock (
    item_name TEXT PRIMARY KEY,
    quantity INTEGER
);
CREATE TABLE IF NOT EXISTS cash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    amount REAL,
    description TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    amount REAL,
    type TEXT
);`;

db.exec(schema, (err) => {
    if (err) console.error(err.message);
    db.close();
});
