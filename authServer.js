const express = require('express');
const mysql = require('mysql2/promise'); // Using promises for cleaner syntax
//const bcrypt = require('bcryptjs'); // For secure password hashing
const jwt = require('jsonwebtoken'); // For generating authentication tokens
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

app.use(bodyParser.json()) // for parsing application/json
app.use(cors());

const saltRounds = 10;


// Replace with your MySQL connection details
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'BOOK_EXCHANGE_SYSTEM'
});

async function createDatabaseAndTables() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'root',
    });

    // Create database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS book_exchange_system');

    // Switch the connection to use the new database
    await connection.query('USE book_exchange_system');

    // Create User table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS User (
        USER_ID INT PRIMARY KEY AUTO_INCREMENT,
        EMAIL_ID VARCHAR(255) UNIQUE,
        PASSWORD VARCHAR(255),
        registration_date DATE,
        last_login_date DATE
      )
    `);

    // Create UserProfile table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS UserProfile (
        profile_id INT PRIMARY KEY AUTO_INCREMENT,
        USER_ID INT UNIQUE,
        reading_preferences JSON,
        favorite_genres JSON,
        FOREIGN KEY (USER_ID) REFERENCES User(USER_ID)
      )
    `);

    // Create Book table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Book (
        book_id INT PRIMARY KEY AUTO_INCREMENT,
        title VARCHAR(255),
        author VARCHAR(255),
        genre VARCHAR(255),
        book_condition VARCHAR(255),
        availability_status ENUM('Available', 'Unavailable'),
        owner_id INT,
        FOREIGN KEY (owner_id) REFERENCES User(USER_ID)
      )
    `);

    // Create Exchange table with delivery_method and duration_of_book columns
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Exchange (
        exchange_id INT PRIMARY KEY AUTO_INCREMENT,
        requester_id INT,
        owner_id INT,
        book_id INT,
        delivery_method VARCHAR(255),
        duration_of_book JSON,
        FOREIGN KEY (requester_id) REFERENCES User(USER_ID),
        FOREIGN KEY (owner_id) REFERENCES User(USER_ID),
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
      )
    `);

    // Create Transaction table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Transaction (
        transaction_id INT PRIMARY KEY AUTO_INCREMENT,
        exchange_id INT,
        requester_id INT,
        book_id INT,
        transaction_status ENUM('initiated', 'completed'),
        FOREIGN KEY (exchange_id) REFERENCES Exchange(exchange_id),
        FOREIGN KEY (requester_id) REFERENCES User(USER_ID),
        FOREIGN KEY (book_id) REFERENCES Book(book_id)
      )
    `);

    await connection.end();
    console.log("Tables created successfully!");
  } catch (error) {
    console.error('Error creating database and tables:', error);
    process.exit(1);
  }
}


createDatabaseAndTables();

// Secret key for generating JWT tokens (replace with a strong secret)
const jwtSecret = 'your_jwt_secret';

// Login route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate username presence
    if (!email) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Connect to MySQL database
    const connection = await pool.getConnection();

    // Find user by username
    const [rows] = await connection.query('SELECT * FROM user WHERE EMAIL_ID = ?', [email]);

    // Release connection
    await connection.release();

    if (!rows.length) {
      return res.status(401).json({ message: 'Account does not exists' });
    }

    const user = rows[0];

    if (password !== user.PASSWORD) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    // Update last_login_date with current timestamp
    const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' '); // Get current date and time
    await connection.query('UPDATE User SET last_login_date = ? WHERE USER_ID = ?', [currentDate, user.USER_ID]);


    // Generate JWT token with user ID
    const userid = user.USER_ID;
    const payload = { userId: user.USER_ID };
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '1h' }); // Token expires in 1 hour

    res.json({ userid, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/register', async (req, res) => {
  const { email, password } = req.body;

  try {
    // Validate username presence
    if (!email) {
      return res.status(400).json({ message: 'Username is required' });
    }

    // Connect to MySQL database
    let connection = await pool.getConnection();

    // Check for existing username (using prepared statement)
    const [existingUser] = await connection.query('SELECT * FROM user WHERE EMAIL_ID = ?', [email]);

    // Release connection
    await connection.release();

    if (existingUser.length) {
      return res.status(409).json({ message: 'Username already exists' });
    }


      
    // Hash password using bcrypt
    // const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user data (using prepared statement)
      connection = await pool.getConnection();
    // Get current date and time
     const currentDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

     // Insert new user data (using prepared statement) and update registration_date and last_login_date
     const [result] = await connection.query(
       'INSERT INTO User (EMAIL_ID, PASSWORD, registration_date, last_login_date) VALUES (?, ?, ?, ?)',
       [email, password, currentDate, currentDate]
     );

    // Release connection
    await connection.release();

    res.json({ message: 'Registration successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Protected route (middleware to verify authorization token)
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.userId = decoded.userId; // Attach user ID to the request object
    next();
  } catch (error) {
    console.error(error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

app.get('/protected', verifyToken, (req, res) => {
  // Access protected data or resources here, using req.userId
  res.json({ message: 'Welcome, authorized user!' });
});

app.listen(3000, () => console.log('Server listening on port 3000'));