require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const cors = require('cors');
const { google } = require('googleapis');
//const nodemailer = require('nodemailer');

const sgMail = require('@sendgrid/mail')
sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const msg = {
  to: 'rbentertainmentinfo@gmail.com', // Change to your recipient
  from: 'admin@a1dos-creations.com', // Change to your verified sender
  subject: 'Test Email from A1DOS Creations',
  text: 'and easy to do anywhere, even with Node.js',
  html: '<button href="https://a1dos-creations.com/account/account">Go To Your Dashboard</button>',
}
sgMail
  .send(msg)
  .then(() => {
    console.log('Email sent')
  })
  .catch((error) => {
    console.error(error)
  })

const app = express();
app.use(cors()); 
app.use(express.json());

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const JWT_SECRET = process.env.JWT_SECRET;


// --- User Authentication Endpoints ---
app.post('/register-user', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json('Please fill in name, email, and password');
  }
  try {
    const hashedPassword = await bcrypt.hash(password.trim(), 10);
    const [newUser] = await db('users')
      .insert({
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword
      })
      .returning(['id', 'name', 'email']);

    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '1d' });

    res.json({ user: { name: newUser.name, email: newUser.email }, token });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json('Error registering user');
  }
});

app.post('/login-user', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json('Please provide email and password');
  }
  try {
    const user = await db('users')
      .select('id', 'name', 'email', 'password')
      .where({ email: email.trim() })
      .first();

    if (!user) {
      return res.status(400).json('Email or password is incorrect');
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(400).json('Email or password is incorrect');
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ user: { name: user.name, email: user.email }, token });
    /*const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: email,
        pass: process.env.EMAIL_PASSWORD
      }
    });*/

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json('Error logging in');
  }
});

// --- Google OAuth Setup ---
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,     
  process.env.GOOGLE_CLIENT_SECRET, 
  'https://a1dos-login.onrender.com/auth/google/callback'
);

app.get('/auth/google', (req, res) => {
  const scopes = [
    'https://www.googleapis.com/auth/classroom.courses.readonly', 
    'https://www.googleapis.com/auth/calendar'                    
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent'
  });
  res.redirect(url);
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; 

  if (!code) {
    return res.status(400).send("No code provided.");
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Google OAuth tokens:", tokens);
    
    if (userId) {
      await db('users').where({ id: userId }).update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date 
      });
    } else {
      console.error("No userId found in state parameter");
    }
    
    res.redirect('https://a1dos-creations.com/account/account?googleLinked=true');
  } catch (err) {
    console.error("Error exchanging code for token:", err);
    res.status(500).send("Authentication error");
  }
});

app.post('/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: "No token provided" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(401).json({ valid: false, error: "Invalid token" });
      res.json({ valid: true, user: decoded });
  });
});

app.post('/unlink-google', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) {
          return res.status(400).json({ success: false, message: "Missing token." });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const user = await db('users').where({ id: userId }).first();
      if (!user) {
          return res.status(404).json({ success: false, message: "User not found." });
      }

      await db('users')
          .where({ id: userId })
          .update({
              google_access_token: null,
              google_refresh_token: null,
              google_token_expiry: null
          });

      res.json({ success: true, message: "Google account unlinked successfully." });
  } catch (error) {
      console.error("Error unlinking Google:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
