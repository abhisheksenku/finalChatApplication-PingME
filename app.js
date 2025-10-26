// ================== 1. IMPORTS ==================
// Loads environment variables from the .env file into process.env
// This line runs immediately when the file is loaded — no hoisting needed.
require("dotenv").config();
// Imports the Express framework (used to create a web server)
// Variables declared with const are NOT hoisted (they’re in the temporal dead zone until initialized)
const express = require("express");
// Imports the built-in Node.js 'path' module for handling file and directory paths
const path = require("path");
// Imports cookie-parser middleware to read cookies from incoming requests
const cookieParser = require("cookie-parser");

///////////////// Custom files//////////
// Imports the authentication middleware from the './middleware/auth.js' file.
// 'userAuthenticate' will likely contain the 'authenticate' function
// used to protect routes and verify the user's JWT token.
const userAuthenticate = require('./middleware/auth');
// Imports a custom module that initializes and exports a Sequelize database connection
const database = require("./utilities/sql");
// Imports your Sequelize model associations (ensures relationships between models are set up)
// These require statements are all executed synchronously at the top level before the code runs
const models = require("./models/associations");
// Imports the router file from './routes/authRoutes.js'.
// The 'authRoutes' variable now holds the Express router "mini-application"
// that you defined, which contains all your auth-related endpoints (like /signup, /login).
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const contactRoutes = require("./routes/contactRoutes");
const userRoutes = require('./routes/userRoutes');
const groupRoutes = require('./routes/groupRoutes');
// ================== 2. INITIALIZATION ==================
// Creates an Express application instance
// This must come after requiring express
const app = express();

// Reads the PORT value from environment variables, or defaults to 3000 if not set
const port = process.env.PORT || 3000;
// ================== 3. EXPRESS MIDDLEWARE ==================
// Registers cookie-parser middleware to parse cookies from each incoming request
app.use(cookieParser());

// Adds built-in Express middleware to parse JSON bodies in incoming requests
app.use(express.json());

// Serve static files (like CSS, JS, images) from the "public" folder
// This lets the browser directly access files inside "public" using their path (e.g., /css/page.css)
app.use(express.static(path.join(__dirname, "public")));
// ================== 4. EXPRESS ROUTES ==================
// Defines a GET route at the root path ("/")
// When accessed, it sends back a JSON response with "Hello"
// app.get("/", (req, res) => {
//     res.sendFile("Hello");
// });
// Mounts the imported 'authRoutes' on the main Express app.
// This tells Express: "For any request that starts with the path '/api/auth',
// pass the request on to the 'authRoutes' router to handle."
//
// Examples:
// A POST request to '/api/auth/login' -> goes to the '/login' handler in authRoutes.
// A POST request to '/api/auth/signup' -> goes to the '/signup' handler in authRoutes.
app.use("/api/user", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/chat",chatRoutes);
app.use("/api/contacts",contactRoutes);
app.use("/api/group", groupRoutes)
/**
 * Route:   GET /
 * Purpose: Serves the main landing page (the "page.html" file).
 * This is the primary entry point for users visiting your website's domain.
 */
app.get("/", (req, res) => {
  // res.sendFile() sends a file as the response.
  // path.join() creates a safe, cross-platform file path:
  // [Your_Project_Folder]/views/page.html
  res.sendFile(path.join(__dirname, "views", "page.html"));
});
/**
 * Route:   GET /forgot-password
 * Purpose: Serves the "Forgot Password" page.
 * When a user navigates to "http://.../forgot-password", this runs.
 */
app.get("/forgot-password", (req, res) => {
  // res.sendFile() sends a file as the response.
  // path.join() creates a safe, cross-platform file path:
  // [Your_Project_Folder]/views/forgotPassword.html
  res.sendFile(path.join(__dirname, "views", "forgotPassword.html"));
});

/**
 * Route:   GET /reset-password/:token
 * Purpose: Serves the "Reset Password" page.
 * This route is special:
 * - ":token" is a dynamic URL parameter.
 * - It will match any link like "/reset-password/abc123xyz".
 * - This link is what you would email to the user.
 */
app.get('/reset-password/:token', (req, res) => {
  // It sends the reset-password.html file to the user.
  // The JavaScript on that page (reset-Password.js) will be responsible
  // for reading the 'token' from the URL.
  res.sendFile(path.join(__dirname, 'views', 'reset-password.html'));
});

/**
 * Route:   GET /signup
 * Purpose: Serves the "Sign Up" page.
 */
app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "signup.html"));
});

/**
 * Route:   GET /login
 * Purpose: Serves the "Login" page.
 */
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "login.html"));
});
/**
 * Route:   GET /chat
 * Purpose: Serves the main chat application page.
 * Middleware: `userAuthenticate.authenticate`
 * - This route is **protected**. The `authenticate` middleware runs *first*.
 * - If the user is not authenticated (e.g., no valid token), the middleware
 * will block the request (e.g., redirect to /login).
 * - If the user *is* authenticated, it calls `next()` and allows the
 * request to proceed to the next function.
 * Logic:
 * - Once authenticated, this function runs and sends the main
 * `chat.html` file to the user's browser.
 */
app.get("/chat", userAuthenticate.authenticate, (req, res) => {
  res.sendFile(path.join(__dirname, "views", "chat.html"));
});
// ================== 6. SERVER STARTUP ==================
// Immediately Invoked Async Function Expression (IIFE)
// Used here to handle asynchronous startup tasks like connecting to the database
(async () => {
    try {
        // Synchronizes Sequelize models with the database (force: true drops & recreates tables)
        await database.sync({ force: false });

        // Starts the Express server and listens on the specified port
        // Hoisting note: app and port are both already declared and initialized above, so accessible here
        app.listen(port, () => {
            console.log(`🔌 Server with WebSocket support running on port ${port}`);
        });
    } catch (error) {
        // Logs any errors that occur during database connection or server startup
        console.error("Unable to connect to the database:", error);
    }
})();
