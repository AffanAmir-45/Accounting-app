-- Create invoices table
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

-- Create stock table
CREATE TABLE IF NOT EXISTS stock (
    item_name TEXT PRIMARY KEY,
    quantity INTEGER
);

-- Create cash book
CREATE TABLE IF NOT EXISTS cash (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    amount REAL,
    description TEXT
);

-- Create debtors/creditors
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    amount REAL,
    type TEXT  -- debtor or creditor
);
