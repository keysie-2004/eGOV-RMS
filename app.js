const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cookieParser = require('cookie-parser');
const path = require('path');
require('dotenv').config();
const session = require('express-session');
const flash = require('connect-flash');
const os = require('os');

// Increase EventEmitter limit
require('events').EventEmitter.defaultMaxListeners = 15;

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  socket.on('joinGeneral', () => socket.join('general'));
  socket.on('joinPrivate', (chatId) => socket.join(`private_${chatId}`));
  socket.on('joinSupport', (chatId) => socket.join(`support_${chatId}`));
  socket.on('disconnect', () => console.log('User disconnected:', socket.id));
});

app.set('io', io);

// Middleware
app.use(express.json()); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded payloads
app.use(cookieParser());
app.use(session({
  secret: 'hareneth',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));
app.use(flash());

// Configure multer for multipart/form-data (no file uploads)
const multer = require('multer');
const upload = multer(); // No storage needed since no files are uploaded
app.use(upload.none()); // Parse multipart/form-data without files

// Flash middleware
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.message = req.flash();
  next();
});

const userMiddleware = require('./middlewares/userMiddleware');
app.use(userMiddleware);

// View engine and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/homepage');
  } else {
    res.redirect('/login');
  }
});


// Route imports
app.use(require('./routes/authRoutes'));
app.use('/', require('./routes/employeeRoutes'));
app.use(require('./routes/departmentRoutes'));
app.use('/', require('./routes/inventoryRoutes'));
app.use('/', require('./routes/Routes')); // Note: Repeated routes, consider consolidating
app.use('/', require('./routes/eppCodeRoutes'));
app.use('/', require('./routes/conditionRoutes'));
app.use('/', require('./routes/empInfoRoutes'));
app.use(require('./routes/Routes')); // accounting
app.use(require('./routes/Routes')); // arrivals
app.use(require('./routes/Routes')); // par
app.use(require('./routes/Routes')); // reports
app.use(require('./routes/requestsRoutes'));
app.use(require('./routes/Routes')); // users_list
app.use(require('./routes/Routes')); // view_request
app.use(require('./routes/Routes')); // par_propertyvehicles
app.use(require('./routes/Routes')); 
app.use(require('./routes/Routes')); 
app.use('/', require('./routes/rfqRoutes'));
app.use(require('./routes/approvalsRoutes'));
app.use(require('./routes/dashboardRoutes'));
app.use('/', require('./routes/reportRoutes'));
app.use('/', require('./routes/inspectionRoutes'));
app.use('/api', require('./routes/dynamicprofileRoutes'));
app.use('/', require('./routes/homepageRoutes'));
app.use('/predictive', require('./routes/predictiveRoutes'));
app.use('/', require('./routes/chatRoutes'));
app.use('/', require('./routes/incomingReportsRoutes'));
app.use('/', require('./routes/outgoingReportsRoutes'));
app.use('/', require('./routes/icsRoutes'));
app.use('/chat', require('./routes/chatmessagingRoutes'));
app.use('/supplier', require('./routes/supplierRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/notifications', require('./routes/notificationRoutes'));
app.use('/budget', require('./routes/depBudgetRoutes'));

// Serve static assets
app.use('/css', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/css')));
app.use('/js', express.static(path.join(__dirname, 'node_modules/bootstrap/dist/js')));
app.use('/icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font')));
app.use('/fa', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free')));

app.use('/fa-webfonts', express.static(path.join(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts')));
app.use('/signature', express.static(path.join(__dirname, 'node_modules/signature_pad/dist')));
// Start server
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  const networkInterfaces = os.networkInterfaces();
  let ipAddress;
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        ipAddress = ipAddress || iface.address;
      }
    });
  });

  console.log(`\n Server running on:
  - Local:   http://localhost:${PORT}
  - Network: http://${ipAddress}:${PORT}\n`);
});