const express = require('express');
const Joi = require('joi');
const Transaction = require('../models/Transaction');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Validation schemas
const transactionSchema = Joi.object({
  amount: Joi.number().not(0).required().messages({
    'number.base': 'Amount must be a valid number',
    'any.invalid': 'Amount cannot be zero',
    'any.required': 'Amount is required'
  }),
  description: Joi.string().min(1).max(500).required().messages({
    'string.min': 'Description cannot be empty',
    'string.max': 'Description cannot exceed 500 characters',
    'any.required': 'Description is required'
  }),
  date: Joi.date().max('now').required().messages({
    'date.base': 'Please provide a valid date',
    'date.max': 'Transaction date cannot be in the future',
    'any.required': 'Transaction date is required'
  }),
  category: Joi.string().valid(
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
  ).required().messages({
    'any.only': 'Please select a valid category',
    'any.required': 'Category is required'
  }),
  subcategory: Joi.string().max(100).allow(''),
  type: Joi.string().valid('income', 'expense', 'transfer'),
  isTaxDeductible: Joi.boolean().default(false),
  taxCategory: Joi.string().valid('business', 'medical', 'education', 'charity', 'other').allow(null),
  location: Joi.object({
    name: Joi.string().allow(''),
    address: Joi.string().allow(''),
    coordinates: Joi.object({
      latitude: Joi.number().min(-90).max(90),
      longitude: Joi.number().min(-180).max(180)
    })
  }),
  paymentMethod: Joi.string().valid('cash', 'credit_card', 'debit_card', 'bank_transfer', 'mobile_payment', 'check', 'other').default('other'),
  notes: Joi.string().max(1000).allow(''),
  tags: Joi.array().items(Joi.string().max(50))
});

// @route   POST /api/transactions
// @desc    Create a new transaction
// @access  Private
router.post('/', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = transactionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    // Set transaction type based on amount if not provided
    if (!value.type) {
      value.type = value.amount > 0 ? 'income' : 'expense';
    }

    // Create new transaction
    const transaction = new Transaction({
      ...value,
      userId: req.user._id,
      source: 'manual' // Since this is manual entry via API
    });

    await transaction.save();

    res.status(201).json({
      success: true,
      message: 'Transaction created successfully',
      data: {
        transaction: transaction
      }
    });

  } catch (error) {
    console.error('Transaction creation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create transaction'
    });
  }
});

// @route   GET /api/transactions
// @desc    Get user's transactions with optional filtering
// @access  Private
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      startDate,
      endDate,
      category,
      type,
      minAmount,
      maxAmount,
      search,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { userId: req.user._id };

    // Date range filter
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Type filter
    if (type) {
      filter.type = type;
    }

    // Amount range filter
    if (minAmount || maxAmount) {
      filter.amount = {};
      if (minAmount) filter.amount.$gte = parseFloat(minAmount);
      if (maxAmount) filter.amount.$lte = parseFloat(maxAmount);
    }

    // Search in description
    if (search) {
      filter.description = { $regex: search, $options: 'i' };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const transactions = await Transaction.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // Use lean() for better performance

    // Get total count for pagination
    const total = await Transaction.countDocuments(filter);

    // Calculate pagination info
    const totalPages = Math.ceil(total / parseInt(limit));
    const hasNextPage = parseInt(page) < totalPages;
    const hasPrevPage = parseInt(page) > 1;

    res.status(200).json({
      success: true,
      data: {
        transactions: transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: totalPages,
          totalTransactions: total,
          hasNextPage: hasNextPage,
          hasPrevPage: hasPrevPage,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Transaction fetch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch transactions'
    });
  }
});

// @route   GET /api/transactions/:id
// @desc    Get single transaction by ID
// @access  Private
router.get('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction does not exist or you do not have permission to view it'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        transaction: transaction
      }
    });

  } catch (error) {
    console.error('Transaction fetch error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch transaction'
    });
  }
});

// @route   PUT /api/transactions/:id
// @desc    Update transaction by ID
// @access  Private
router.put('/:id', async (req, res) => {
  try {
    // Validate request body (allow partial updates)
    const updateSchema = transactionSchema.fork(['amount', 'description', 'date', 'category'], (schema) => schema.optional());
    
    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details[0].message
      });
    }

    // Find and update transaction
    const transaction = await Transaction.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: value },
      { 
        new: true, // Return updated document
        runValidators: true // Run schema validators
      }
    );

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction does not exist or you do not have permission to update it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction updated successfully',
      data: {
        transaction: transaction
      }
    });

  } catch (error) {
    console.error('Transaction update error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update transaction'
    });
  }
});

// @route   DELETE /api/transactions/:id
// @desc    Delete transaction by ID
// @access  Private
router.delete('/:id', async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({
        error: 'Transaction not found',
        message: 'Transaction does not exist or you do not have permission to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Transaction deleted successfully',
      data: {
        deletedTransaction: transaction
      }
    });

  } catch (error) {
    console.error('Transaction deletion error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete transaction'
    });
  }
});

// @route   GET /api/transactions/analytics/summary
// @desc    Get transaction analytics summary
// @access  Private
router.get('/analytics/summary', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to current month if no dates provided
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date();

    // Aggregate pipeline for summary statistics
    const summary = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);

    // Get spending by category
    const categoryBreakdown = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: 'expense',
          date: { $gte: start, $lte: end }
        }
      },
      {
        $group: {
          _id: '$category',
          totalAmount: { $sum: { $abs: '$amount' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let transactionCount = 0;

    summary.forEach(item => {
      if (item._id === 'income') {
        totalIncome = item.totalAmount;
      } else if (item._id === 'expense') {
        totalExpenses = Math.abs(item.totalAmount);
      }
      transactionCount += item.count;
    });

    const netIncome = totalIncome - totalExpenses;

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalIncome: totalIncome,
          totalExpenses: totalExpenses,
          netIncome: netIncome,
          transactionCount: transactionCount,
          dateRange: {
            startDate: start,
            endDate: end
          }
        },
        categoryBreakdown: categoryBreakdown,
        monthlyTrends: summary
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate analytics'
    });
  }
});

module.exports = router;
