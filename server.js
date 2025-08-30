// AI Finance Assistant - Production Backend Server
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// SECURITY MIDDLEWARE (Enterprise-Grade)
// ============================================================================

// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Compression for better performance
app.use(compression());

// Rate limiting to prevent abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// ============================================================================
// CORS CONFIGURATION (Production-Ready)
// ============================================================================

const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? [
      process.env.FRONTEND_URL,
      'https://*.netlify.app',
      'https://*.netlify.com'
    ]
  : [
      'http://localhost:3000',
      'https://localhost:3000',
      'http://127.0.0.1:3000'
    ];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin.includes('*')) {
        const pattern = allowedOrigin.replace('*', '.*');
        return new RegExp(pattern).test(origin);
      }
      return allowedOrigin === origin;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// ============================================================================
// BODY PARSING MIDDLEWARE
// ============================================================================

app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// LOGGING MIDDLEWARE
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ============================================================================
// DATABASE CONNECTION (MongoDB Atlas)
// ============================================================================

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4 // Use IPv4, skip trying IPv6
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas successfully');
  console.log('📊 Database Name:', mongoose.connection.name);
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 MongoDB disconnected');
});

// ============================================================================
// API ROUTES (Will be added later)
// ============================================================================

// Import routes when files are created
// const authRoutes = require('./routes/auth');
// const transactionRoutes = require('./routes/transactions');
// const aiRoutes = require('./routes/ai');

// Use routes
// app.use('/api/auth', authRoutes);
// app.use('/api/transactions', transactionRoutes);
// app.use('/api/ai', aiRoutes);

// ============================================================================
// HEALTH CHECK & STATUS ENDPOINTS
// ============================================================================

// Health check endpoint
app.get('/health', (req, res) => {
  const healthCheck = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    memory: process.memoryUsage(),
  };
  
  res.status(200).json(healthCheck);
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'AI Finance Assistant API',
    version: '1.0.0',
    status: 'Running',
    documentation: '/api/docs',
    health: '/health'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'AI Finance Assistant API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      transactions: '/api/transactions',
      ai: '/api/ai'
    }
  });
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE (Must be last)
// ============================================================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
    message: 'The requested resource was not found on this server'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error Stack:', err.stack);
  
  // Don't expose error details in production
  const message = process.env.NODE_ENV === 'production' 
    ? 'Something went wrong!' 
    : err.message;
    
  const statusCode = err.statusCode || err.status || 500;
  
  res.status(statusCode).json({
    error: message,
    timestamp: new Date().toISOString(),
    path: req.path,
    ...(process.env.NODE_ENV === 'development' && { 
      stack: err.stack,
      details: err 
    })
  });
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 ===============================================');
  console.log('🚀 AI FINANCE ASSISTANT API SERVER STARTED');
  console.log('🚀 ===============================================');
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`📡 Server URL: http://localhost:${PORT}`);
  console.log(`⚡ API Base URL: http://localhost:${PORT}/api`);
  console.log(`💚 Health Check: http://localhost:${PORT}/health`);
  console.log('🚀 ===============================================');
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close();
    process.exit(0);
  });
});

module.exports = app;
