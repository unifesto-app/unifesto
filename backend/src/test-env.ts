// Jest setup: newer Razorpay and AWS SDK clients throw at construction
// when credentials/region are missing, so give specs harmless defaults.
process.env.RAZORPAY_KEY_ID ??= 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET ??= 'dummy_secret';
process.env.AWS_REGION ??= 'ap-south-1';
