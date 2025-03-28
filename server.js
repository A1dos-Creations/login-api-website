import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import knex from 'knex';
import cors from 'cors';
import { google } from 'googleapis';
import http from 'http';
import { WebSocketServer } from 'ws';
import Stripe from 'stripe';
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
import sgMail from '@sendgrid/mail';
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
import session from 'express-session';

/*
import classesRouter from '/routes/classes.js';
import assignmentsRouter from './routes/assignments.js';
import syncRouter from './routes/sync.js';
*/

console.log(crypto.randomBytes(32).toString('hex'));

const allowedOrigins = [
  'https://a1dos-creations.com',
  'https://a1dos-login.onrender.com',
  'https://api.a1dos-creations.com',
  'chrome-extension://bilnakhjjjkhhhdlcajijkodkhmanfbg',
  'chrome-extension://pafdkffolelojifgeepmjjofdendeojf',
  'http://127.0.0.1:3000'
];

const app = express();
app.use(cors({
  origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
      } else {
          callback(new Error('Not allowed by CORS'));
      }
  },
  methods: ['GET', 'POST'],
  allowedHeaders: 'Content-Type,Authorization'
}));
app.options('*', cors());
app.use(express.json());

app.use(session({
  secret: 'env.JWT_SECRET',
  resave: false,
  saveUninitialized: true
}));

/*
app.use('/api', classesRouter);
app.use('/api', assignmentsRouter);
app.use('/api', syncRouter);
*/

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const activeSockets = new Map();

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});
wss.on('connection', (ws, request) => {
  ws.on('message', (message) => {
    try {
      const { token } = JSON.parse(message);
      if (token) {
        activeSockets.set(token, ws);
      }
    } catch (error) {
      console.error("WebSocket message error:", error);
    }
  });
  ws.on('close', () => {
    for (const [token, sock] of activeSockets.entries()) {
      if (sock === ws) {
        activeSockets.delete(token);
      }
    }
  });
});

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    ssl: { require: true, rejectUnauthorized: false }
  }
});

const JWT_SECRET = process.env.JWT_SECRET;

import crypto from 'crypto';
import movieRouter from './routes/movies.js';
import rsvpRouter from './routes/rsvp.js';
import rsvpDataRouter from './routes/rsvp-data.js';

app.use('/movie/rsvp', rsvpRouter);
app.use('/movie', movieRouter);
app.use('/movies', rsvpDataRouter);

/*
app.use((req, res) => {
  res.status(404).send("Page not found");
});*/

const schoolData = {
  "CCUSD": ["Culver City Middle School (CCMS)", "Culver City High School (CCHS)", "El Marino Language School", "El Rincon Elementary School", "Farragut Elementary School", "La Ballona Elementary School", "Linwood E. Howe Elementary School"],
  "LAUSD": ["Abraham Lincoln Senior High", "Academia Moderna", "Academy for Enriched Sciences", "Academy of Environmental & Social Policy (ESP)", "Academy of Medical Arts at Carson High", "Academy of the Canyons", "Academy of the Canyons Middle College High", "Academy of the Redwoods"]
};

app.get('/get-schools', (req, res) => {
    res.json(schoolData);
});

app.post('/save-school', async (req, res) => {
  try {
      const { token, schoolDistrict, schoolName } = req.body;
      if (!token) return res.status(400).json({ success: false, message: "Missing token." });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      await db('user_schools')
          .insert({ user_id: userId, school_district: schoolDistrict, school_name: schoolName })
          .onConflict('user_id')
          .merge();

      res.json({ success: true, message: "School saved successfully." });
  } catch (error) {
      console.error("Error saving school:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/get-user-school', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ success: false, message: "Missing token." });

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.id;

      const school = await db('user_schools').where({ user_id: userId }).first();
      if (!school) return res.json({ success: false, school: null });

      res.json({ success: true, school });
  } catch (error) {
      console.error("Error fetching school:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

const emailVerificationCodes = new Map(); // Store email verification codes temporarily

app.post("/request-email-change", async (req, res) => {
  const { token, password, newEmail } = req.body;
  if (!token || !password || !newEmail) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db("users").where({ id: decoded.id }).first();

    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Incorrect password." });
    }

    const verificationCode = crypto.randomInt(100000, 999999).toString();
    emailVerificationCodes.set(newEmail, { code: verificationCode, userId: user.id });

    const msg = {
      to: newEmail,
      from: 'admin@a1dos-creations.com',
      subject: `Change Email for ${user.name}`,
      html: `
      <div style="justify-items:center;">
          <tr height="32" style="height:32px">
          <td></td>
          </tr>
          <tr align="center">
            <div>
              <div>
              </div>
            </div>
            <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
            <tbody>
            <tr>
            <td width="8" style="width:8px"></td>
            <td>
              <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>Email Change Verification Request</strong></div>
                <div style="font-size:24px">For user: <strong>${user.name}</strong></div>
                <div style="font-size:24px">Your verification code is: <strong>${verificationCode}</strong></div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
              </div>
            <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, ignore this email. We will never ask for your password or verification code.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
            </div>
            </div>
          </tr>
          <tr height="32" style="height:32px">
            <td></td>
          </tr>
          </div>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false }
          }
  };
  sgMail.send(msg)
      .then(() => res.json({ success: true, message: "Verification code sent." }))
      .catch(error => {
          console.error("SendGrid Error:", error.response.body);
          res.status(500).json({ success: false, message: "Error sending email." });
      });

    res.json({ success: true, message: "Verification code sent to new email." });

  } catch (err) {
    console.error("Error requesting email change:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});
app.post("/verify-email-change", async (req, res) => {
  const { newEmail, code } = req.body;

  if (!newEmail || !code) {
    return res.status(400).json({ success: false, message: "Missing fields." });
  }

  const storedData = emailVerificationCodes.get(newEmail);
  if (!storedData || storedData.code !== code) {
    return res.status(400).json({ success: false, message: "Invalid or expired code." });
  }

  try {
    await db("users").where({ id: storedData.userId }).update({ email: newEmail });
    emailVerificationCodes.delete(newEmail);

    res.json({ success: true, message: "Email updated successfully." });

  } catch (err) {
    console.error("Error updating email:", err);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});


app.post('/send-verification-code', async (req, res) => {
    const { email } = req.body;
    try {
        const user = await db('users').where({ email }).first();
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiryTime = new Date(Date.now() + 15 * 60 * 1000); 

        await db('verification_codes').insert({
            user_id: user.id,
            code: verificationCode,
            expiry: expiryTime
        });

        const msg = {
            to: email,
            from: 'admin@a1dos-creations.com',
            subject: `${user.name} Password Change Verification Code`,
            html: `
            <div style="justify-items:center;">
                <tr height="32" style="height:32px">
                <td></td>
                </tr>
                <tr align="center">
                  <div>
                    <div>
                    </div>
                  </div>
                  <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                  <tbody>
                  <tr>
                  <td width="8" style="width:8px"></td>
                  <td>
                    <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                      <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                      <div style="font-size:24px"><strong>Password Change Verification Request</strong></div>
                      <div style="font-size:24px">For user: <strong>${user.name}</strong></div>
                      <div style="font-size:24px">Your verification code is: <strong>${verificationCode}</strong></div>
                      <table align="center" style="margin-top:8px">
                      <tbody><tr style="line-height:normal">
                      <td align="right" style="padding-right:8px">
                      </td>
                      </tr>
                      </tbody>
                      </table>
                    </div>
                  <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, ignore this email. We will never ask for your password or verification code.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
                  </div>
                  </div>
                </tr>
                <tr height="32" style="height:32px">
                  <td></td>
                </tr>
                </div>
                `,
                trackingSettings: {
                  clickTracking: { enable: false, enableText: false }
                }
        };
        sgMail.send(msg)
            .then(() => res.json({ success: true, message: "Verification code sent." }))
            .catch(error => {
                console.error("SendGrid Error:", error.response.body);
                res.status(500).json({ success: false, message: "Error sending email." });
            });

    } catch (error) {
        console.error("Error sending verification code:", error);
        res.status(500).json({ success: false, message: "Internal server error." });
    }
});

app.post('/update-password', async (req, res) => {
  try {
    const { email, verificationCode, newPassword } = req.body;

    const user = await db('users').where({ email }).first();
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    const validCode = await db('verification_codes')
        .where({ user_id: user.id, code: verificationCode })
        .andWhere('expiry', '>', new Date())
        .first();

    if (!validCode) {
        return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db('users').where({ id: user.id }).update({ password: hashedPassword });

    await db('verification_codes').where({ user_id: user.id }).del();

    const newToken = jwt.sign(
        { id: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );

    res.json({ success: true, message: "Password updated successfully.", token: newToken });

      const msg = {
        to: email,
        from: 'admin@a1dos-creations.com',
        subject: `${user.name} Password Changed`,
        html: `
                <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>A1dos Account Password Changed</strong></div>
                <div style="font-size:19px">For account: <strong>${user.name} (${email})</strong></div>
                <div style="font-size:15px">Your A1 account password has been changed.</div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, reset your password immediately. Please review your account activity.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Check activity</a>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
        `,
        trackingSettings: {
          clickTracking: { enable: false, enableText: false }
        }
    };
    sgMail.send(msg)
    .then(() => res.json({ success: true, message: "Verification code sent." }))
    .catch(error => {
        console.error("SendGrid Error:", error);

        if (error.response) {
            console.error("SendGrid Response Error:", error.response.body);
        } else {
            console.error("Unknown SendGrid error. No response body.");
        }

        res.status(500).json({ success: false, message: "Error sending email." });
    });
  } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

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
        password: hashedPassword,
        email_notifications: true
      })
      .returning(['id', 'name', 'email', 'email_notifications', 'created_at']);
    
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '2d' });
    
    const msg = {
      to: email,
      from: 'admin@a1dos-creations.com',
      subject: `🚀 Welcome to A1dos Creations, ${newUser.name}! ✨`,
      html: `
                <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>Welcome To A1dos Creations!</strong></div>
                <div style="font-size:19px">Welcome, <strong>${name}!</strong></div>
                <div style="font-size:15px">${email}</div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>Welcome! Check out your account dashboard to review recent activity and upgrade your account!<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Account Dashboard</a>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>We're happy to have you!</div>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
      `
    };

    sgMail.send(msg)
      .then(() => console.log(`Welcome email sent to ${email}`))
      .catch(error => console.error("SendGrid Error:", error.response ? error.response.body : error));
    
    res.json({ 
      user: { 
        name: newUser.name, 
        email: newUser.email, 
        email_notifications: newUser.email_notifications, 
        created_at: newUser.created_at 
      }, 
      token 
    });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === '23505') {
      return res.status(400).json('A user with that email already exists.');
    }
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
      .select('id', 'name', 'email', 'password', 'email_notifications')
      .where({ email: email.trim() })
      .first();

    if (!user) {
      return res.status(400).json('Email or password is incorrect');
    }

    const isMatch = await bcrypt.compare(password.trim(), user.password);
    if (!isMatch) {
      return res.status(400).json('Email or password is incorrect');
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '2d' });

    const deviceInfo = req.headers['user-agent'] || "Unknown device";
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0] || req.ip || "Unknown IP";

    let location = "Unknown Location";
    try {
        const locationResponse = await fetch(`http://ip-api.com/json/${ipAddress}`);
        const locationData = await locationResponse.json();
        if (locationData.status === "success") {
            location = `${locationData.city}, ${locationData.regionName}, ${locationData.country}`;
        }
    } catch (error) {
        console.error("Error fetching location:", error);
    }

    await db('user_sessions').insert({
      user_id: user.id,
      session_token: token,
      device_info: deviceInfo,
      ip_address: ipAddress,
      location: location,
      login_time: new Date(),
      last_activity: new Date()
    });


    res.json({ user: { name: user.name, email: user.email, email_notifications: user.email_notifications }, token });
    if(user.email_notifications){
    const msg = {
      to: email,
      from: 'admin@a1dos-creations.com',
      subject: `⚠️ New login for user: ${user.name}`,
      html: `
                <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>New login for ${user.name}</strong></div>
                <div style="font-size:19px"></strong></div>
                <div style="font-size:15px">${user.email}</div>
                <div style="font-size:15px">Sign in location: ${ipAddress}</div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, please reset your password.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account?resetPsw=true" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Reset Password</a>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>Be sure to check your account's linked devices.</div>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
      `,
      trackingSettings: {
        clickTracking: { enable: false, enableText: false },
    }
    }
    sgMail
      .send(msg)
      .catch(error => console.error("SendGrid Error:", error.response.body));
    }

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
  const state = req.query.state || '';

  const scopes = [
    'openid',
    'https://www.googleapis.com/auth/classroom.courses.readonly', 
    'https://www.googleapis.com/auth/calendar'                    
  ];
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    prompt: 'consent',
    state: state
  });
  res.redirect(url);
});

app.get('/health', (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  const userId = req.query.state; 

  if (!code) {
    return res.status(400).send("No code provided.");
  }
  
  if (!userId) {
    console.error("UserId not provided in state parameter. Cannot link Google account.");
    return res.redirect('https://a1dos-creations.com/account/account?googleLinked=false');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Received tokens from Google:", tokens);

    console.log("User ID from state:", userId);
    console.log("Google Tokens:", tokens);

    let googleId = null;
    if (tokens.id_token) {
      try {
        googleId = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).sub;
        console.log("Extracted Google ID:", googleId);
      } catch (decodeErr) {
        console.error("Error decoding id_token:", decodeErr);
      }
    } else {
      console.warn("No id_token received from Google");
    }
    
    await db('users')
      .where({ id: userId })
      .update({ 
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry: tokens.expiry_date,
        google_id: googleId
      });
      res.redirect('https://a1dos-creations.com/account/account?googleLinked=true');

      if(user.email_notifications){
        const msg = {
          to: email,
          from: 'admin@a1dos-creations.com',
          subject: `❗A Google Account Was Linked To Your A1dos Account.`,
          html: `
                      <tr height="32" style="height:32px"><td></td></tr>
                      <tr align="center">
                      <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                      <tbody>
                      <tr>
                      <td width="8" style="width:8px"></td>
                      <td>
                      <br>
                      <br>
                      <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                      <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                      <div style="font-size:24px"><strong>Google Account Linked</strong></div>
                      <div style="font-size:19px">To account: <strong>${user.name} (${email})</strong></div>
                      <table align="center" style="margin-top:8px">
                      <tbody><tr style="line-height:normal">
                      <td align="right" style="padding-right:8px">
                      </td>
                      </tr>
                      </tbody>
                      </table>
                      </div>
                      <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>If this was not you, reset your password immediately and disconnect all Google accounts. Please review your account activity.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Review Activity</a>
                      </div>
                      </div>
                      </tr>
                      <tr height="32" style="height:32px"><td></td></tr>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false },
        }
        }
        sgMail
          .send(msg)
          .then(() => console.log(`Login email sent to ${email}`))
          .catch(error => console.error("SendGrid Error:", error.response.body));
        }
      } catch (err) {
    console.error("Error exchanging code for token:", err);
    res.status(500).send("Authentication error");
  }
});

app.post('/verify-token', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ valid: false, error: "No token provided" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const session = await db('user_sessions').where({ session_token: token }).first();
    if (!session) {
      return res.status(401).json({ valid: false, error: "Session revoked" });
    }
    res.json({ valid: true, user: decoded });
  } catch (err) {
    console.error("Token verification error:", err);
    return res.status(401).json({ valid: false, error: "Invalid token" });
  }
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

app.post('/update-notifications', async (req, res) => {
  try {
      const { token, emailNotifications } = req.body;
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
        .update({ email_notifications: emailNotifications });
      
      // Retrieve the user's email from the database record
      const email = user.email;

      const msg = {
        to: email,
        from: 'admin@a1dos-creations.com',
        subject: `✅ Notifications Restored`,
        html: `
          <tr height="32" style="height:32px"><td></td></tr>
          <tr align="center">
          <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
          <tbody>
          <tr>
          <td width="8" style="width:8px"></td>
          <td>
          <br>
          <br>
          <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
          <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
          <div style="font-size:24px"><strong>Notifications Restored</strong></div>
          <div style="font-size:19px">For account: <strong>${user.name} (${email})</strong></div>
          <table align="center" style="margin-top:8px">
          <tbody><tr style="line-height:normal">
          <td align="right" style="padding-right:8px"></td>
          </tr></tbody>
          </table>
          </div>
          <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left">
            <br>You will now receive updates on Google Accounts linking, STL changes (regarding your account), and password changes.
            <div style="padding-top:32px;text-align:center">
              <a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:blue;border-radius:5px;min-width:90px" target="_blank">
                Account Dashboard
              </a>
            </div>
          </div>
          </tr>
          <tr height="32" style="height:32px"><td></td></tr>
        `,
        trackingSettings: {
          clickTracking: { enable: false, enableText: false },
        }
      };
      
      sgMail
        .send(msg)
        .then(() => console.log(`Notification email sent to ${email}`))
        .catch(error => console.error("SendGrid Error:", error.response.body));
      
      res.json({ success: true, message: "Notification preferences updated." });
  } catch (error) {
      console.error("Error updating notifications:", error);
      res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// --- Stripe Integration Endpoint with user metadata ---
app.post('/create-checkout-session', async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Missing token' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user_id = decoded.id;
    if (!user_id) {
      return res.status(400).json({ error: 'Missing user_id' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Premium (STL+ Product Key)'
          },
          unit_amount: 200, // amount in cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: 'https://a1dos-creations.com/account/chk/success',
      cancel_url: 'https://a1dos-creations.com/account/chk/cancel',
      metadata: {
        user_id: user_id
      }
    });
    
    console.log("Stripe Checkout session created:", session.id);
    return res.json({ id: session.id });
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});


const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 

// Helper function to generate a secure 20-char upgrade key
function generateSecureCode(length = 20) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  // Note: In a real webhook, you may not pass your token in the body.
  const { token } = req.body; 
  let event;
  
  // Validate token to identify the user initiating this process
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const userId = decoded.id;
  
  const user = await db('users').where({ id: userId }).first();
  if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
  }
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.user_id;
    
    console.log(`Payment succeeded for user ${userId}. Session ID: ${session.id}`);
    
    try {
      await db.transaction(async trx => {
        await trx('users').where({ id: userId }).update({ premium: true });
        
        const upgradeCode = generateSecureCode();
        await trx('upgrade_keys')
          .insert({ code: upgradeCode, status: 'UNCLAIMED', user_id: userId });
        
        const msg = {
          to: user.email,
          from: 'admin@a1dos-creations.com',
          subject: `Welcome to Premium ${user.name}! 🎉`,
          html: `
           <tr height="32" style="height:32px"><td></td></tr>
                <tr align="center">
                <table border="0" cellspacing="0" cellpadding="0" style="padding-bottom:20px;max-width:516px;min-width:220px">
                <tbody>
                <tr>
                <td width="8" style="width:8px"></td>
                <td>
                <br>
                <br>
                <div style="border-style:solid;border-width:thin;border-color:#dadce0;border-radius:8px;padding:40px 20px" align="center">
                <div style="font-family:Roboto,RobotoDraft,Helvetica,Arial,sans-serif;border-bottom:thin solid #dadce0;color:rgba(0,0,0,0.87);line-height:32px;padding-bottom:24px;text-align:center;word-break:break-word">
                <div style="font-size:24px"><strong>🎁 Welcome To Premium!</strong></div>
                <div style="font-size:19px">For account: <strong>${user.name}</strong> <strong style="font-size:16px">(${email})</strong></div>
                <div style="font-size:15px">Enter this key to unlock STL+</div>
                <div style="font-size:17pc"><strong>${upgradeCode}</strong></div>
                <table align="center" style="margin-top:8px">
                <tbody><tr style="line-height:normal">
                <td align="right" style="padding-right:8px">
                </td>
                </tr>
                </tbody>
                </table>
                </div>
                <div style="font-family:Roboto-Regular,Helvetica,Arial,sans-serif;font-size:14px;color:rgba(0,0,0,0.87);line-height:20px;padding-top:20px;text-align:left"><br>Don't share this prouduct key, you will not need another one.<div style="padding-top:32px;text-align:center"><a href="https://a1dos-creations.com/account/account" style="font-family:'Google Sans',Roboto,RobotoDraft,Helvetica,Arial,sans-serif;line-height:16px;color:#ffffff;font-weight:400;text-decoration:none;font-size:14px;display:inline-block;padding:10px 24px;background-color:#4184f3;border-radius:5px;min-width:90px" target="_blank">Account Dashboard</a>
                </div>
                </div>
                </tr>
                <tr height="32" style="height:32px"><td></td></tr>
          `,
          trackingSettings: {
            clickTracking: { enable: false, enableText: false }
          }
        };
        await sgMail.send(msg);
        console.log(`User ${userId} updated to premium and upgrade key emailed.`);
      });
    } catch (err) {
      console.error('Error during premium update and upgrade key generation:', err);
    }
  }
  
  res.json({ received: true });
});


app.post('/get-user-sessions', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token." });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    const sessionsQuery = `
      SELECT DISTINCT ON (device_info, location) 
          id, device_info, location, login_time, last_activity, session_token
      FROM user_sessions
      WHERE user_id = ?
      ORDER BY device_info, location, login_time DESC;
    `;
    const result = await db.raw(sessionsQuery, [userId]);
    res.json({ success: true, sessions: result.rows });
  } catch (error) {
    console.error("Error retrieving user sessions:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/revoke-session', async (req, res) => {
  try {
    const { token, sessionId } = req.body;
    if (!token || !sessionId) {
      return res.status(400).json({ success: false, message: "Missing token or sessionId." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const session = await db('user_sessions')
      .where({ id: sessionId, user_id: userId })
      .first();
    if (!session) {
      return res.status(404).json({ success: false, message: "Session not found." });
    }
    await db('user_sessions').where({ id: sessionId }).del();
    console.log(`Session ${sessionId} revoked successfully.`);

    if (activeSockets.has(session.session_token)) {
      const ws = activeSockets.get(session.session_token);
      ws.send(JSON.stringify({ action: "logout" }));
      activeSockets.delete(session.session_token);
    }

    res.json({ success: true, message: "Session revoked successfully." });
  } catch (error) {
    console.error("Error revoking session:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

// ----- Check Google Link Status Endpoint -----
app.post('/check-google-link', async (req, res) => {
  try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ linked: false, message: "No token provided." });
      const decoded = jwt.verify(token, JWT_SECRET);
      const userId = decoded.id;
      const user = await db('users').where({ id: userId }).select('google_id').first();
      if (user && user.google_id) {
          return res.json({ linked: true });
      } else {
          return res.json({ linked: false });
      }
  } catch (error) {
      console.error("Error checking Google link:", error);
      return res.status(500).json({ linked: false, message: "Internal server error." });
  }
});


////////////////////////////////////////////
// NEW: Google Calendar Sync Endpoints
////////////////////////////////////////////

async function getCalendarClient(user) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://a1dos-login.onrender.com/auth/google/callback'
  );
  oauth2Client.setCredentials({
    access_token: user.google_access_token,
    refresh_token: user.google_refresh_token
  });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

app.post('/create-calendar', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, message: "Missing token." });
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    const calendarList = await calendarClient.calendarList.list();
    const calendars = calendarList.data.items;
    let syncedCalendar = calendars.find(cal => cal.summary === "🔄️ STL Synced Tasks");
    if (!syncedCalendar) {
      const createdCal = await calendarClient.calendars.insert({
        requestBody: {
          summary: "🔄️ STL Synced Tasks",
          timeZone: "America/Los_Angeles" 
        }
      });
      syncedCalendar = createdCal.data;
    }
    res.json({ success: true, calendarId: syncedCalendar.id });
  } catch (error) {
    console.error("Error in /create-calendar:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/add-task-event', async (req, res) => {
  try {
    const { token, taskTitle, taskDueDate, taskDescription } = req.body;
    if (!token || !taskTitle || !taskDueDate) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    const calRes = await fetch('https://a1dos-login.onrender.com/create-calendar', {  
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const calData = await calRes.json();
    if (!calData.success) {
      return res.status(400).json({ success: false, message: "Could not create/retrieve calendar." });
    }
    const calendarId = calData.calendarId;
    
    const eventRes = await calendarClient.events.insert({
      calendarId,
      requestBody: {
        summary: taskTitle,
        description: taskDescription || "",
        start: {
          dateTime: new Date(taskDueDate).toISOString(),
          timeZone: "America/Los_Angeles"
        },
        end: {
          dateTime: new Date(new Date(taskDueDate).getTime() + 60 * 60 * 1000).toISOString(), // 1-hour event
          timeZone: "America/Los_Angeles"
        }
      }
    });
    const event = eventRes.data;
    res.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error("Error in /add-task-event:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/delete-task-event', async (req, res) => {
  try {
    const { token, eventId } = req.body;
    if (!token || !eventId) {
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    const user = await db('users').where({ id: userId }).first();
    if (!user || !user.google_access_token) {
      return res.status(400).json({ success: false, message: "Google account not linked." });
    }
    const calendarClient = await getCalendarClient(user);
    
    const calendarList = await calendarClient.calendarList.list();
    const calendars = calendarList.data.items;
    const syncedCalendar = calendars.find(cal => cal.summary === "🔄️ STL Synced Tasks");
    if (!syncedCalendar) {
      return res.status(400).json({ success: false, message: "Synced calendar not found." });
    }
    
    await calendarClient.events.delete({
      calendarId: syncedCalendar.id,
      eventId: eventId
    });
    
    res.json({ success: true, message: "Event deleted successfully." });
  } catch (error) {
    console.error("Error in /delete-task-event:", error);
    res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/claim-upgrade-code', async (req, res) => {
  const { token, code } = req.body;
  if (!token || !code) {
    return res.status(400).json({ success: false, message: "Missing token or code." });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.id;
    await db.transaction(async trx => {
      const upgradeKey = await trx('upgrade_keys')
        .select('*')
        .where({ code, status: 'UNCLAIMED' })
        .forUpdate()
        .first();
      if (!upgradeKey) {
        throw new Error('Invalid or already claimed code.');
      }
      await trx('upgrade_keys')
        .update({ status: 'CLAIMED', user_id: userId, claimed_at: trx.fn.now() })
        .where({ code });
      await trx('users')
        .update({ premium: true })
        .where({ id: userId });
    });
    res.json({ success: true, message: "Upgrade code claimed successfully." });
  } catch (error) {
    console.error("Error claiming upgrade code:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));