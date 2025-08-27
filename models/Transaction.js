const mongoose = require('mongoose');

// Transaction schema definition
const transactionSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
    index: true
  },
  
  // Basic transaction information
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    validate: {
      validator: function(value) {
        return value !== 0;
      },
      message: 'Amount cannot be zero'
    }
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    index: true
  },
  
  // Transaction categorization
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'Food & Dining',
      'Transportation',
      'Shopping',
      'Entertainment',
      'Bills & Utilities',
      'Healthcare',
      'Education',
      'Travel',
      'Business Expenses',
      'Income',
      'Investment',
      'Transfer',
      'Other'
    ]
  },
  subcategory: {
    type: String,
    trim: true,
    maxlength: [100, 'Subcategory cannot exceed 100 characters']
  },
  
  // Transaction type
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: ['income', 'expense', 'transfer'],
    index: true
  },
  
  // Tax information
  isTaxDeductible: {
    type: Boolean,
    default: false
  },
  taxCategory: {
    type: String,
    enum: ['business', 'medical', 'education', 'charity', 'other'],
    default: null
  },
  
  // Location information
  location: {
    name: String,
    address: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // Payment method
  paymentMethod: {
    type: String,
    enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'mobile_payment', 'check', 'other'],
    default: 'other'
  },
  
  // Source information (how was this transaction created)
  source: {
    type: String,
    enum: ['manual', 'email', 'sms', 'voice', 'bank_sync', 'api'],
    default: 'manual'
  },
  
  // AI processing information
  aiProcessing: {
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    originalCategory: String, // AI's initial suggestion
    userCorrected: {
      type: Boolean,
      default: false
    },
    processingDate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Attachments
  attachments: [{
    type: {
      type: String,
      enum: ['receipt', 'invoice', 'image', 'document'],
      required: true
    },
    url: {
      type: String,
      required: true
    },
    filename: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Related transactions (for transfers, splits, etc.)
  relatedTransactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  }],
  
  // Merchant information
  merchant: {
    name: String,
    category: String,
    website: String
  },
  
  // Project/client information (for business users)
  project: {
    name: String,
    code: String,
    client: String
  },
  
  // Status and flags
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'confirmed'
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurringPattern: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
    },
    nextDate: Date,
    endDate: Date
  },
  
  // Notes and tags
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  tags: [String],
  
  // Audit fields
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Indexes for better query performance
transactionSchema.index({ userId: 1, date: -1 });
transactionSchema.index({ userId: 1, category: 1 });
transactionSchema.index({ userId: 1, type: 1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ 'merchant.name': 1 });

// Virtual for transaction month/year
transactionSchema.virtual('monthYear').get(function() {
  return `${this.date.getFullYear()}-${String(this.date.getMonth() + 1).padStart(2, '0')}`;
});

// Virtual for absolute amount (always positive)
transactionSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

// Pre-save middleware
transactionSchema.pre('save', function(next) {
  // Update the updatedAt field
  this.updatedAt = Date.now();
  
  // Set transaction type based on amount if not explicitly set
  if (!this.type) {
    this.type = this.amount > 0 ? 'income' : 'expense';
  }
  
  next();
});

// Static method to get transactions for a date range
transactionSchema.statics.getByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId: userId,
    date: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ date: -1 });
};

// Static method to get spending by category
transactionSchema.statics.getSpendingByCategory = function(userId, startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        userId: mongoose.Types.ObjectId(userId),
        type: 'expense',
        date: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: { $abs: '$amount' } },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);
};

// Instance method to format amount for display
transactionSchema.methods.formatAmount = function(currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(this.amount);
};

module.exports = mongoose.model('Transaction', transactionSchema);
