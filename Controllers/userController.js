const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const joi = require('joi');
const db = require('../Model');
const catchAsync = require('../utils/catchAsync');
const appError = require('../utils/appError');

const User = db.users;


const singToken = id => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
}

const createSendToken = (user, statusCode, res) => {
  const token = singToken(user.id);
  const cookieOptions = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };

  res.cookie('jwt', token, cookieOptions);

  res.status(statusCode).json({
    status: 'success',
    token,
    data: user
  });
};


const signup = catchAsync(async (req, res, next) => {

  const body = joi.object({
    name: joi.string().required(),
    email: joi.string().required().email(),
    password: joi.string().required().min(8),
    confirmPassword: joi.string().valid(joi.ref('password')).required(),
    role: joi.string().valid('admin', 'user').default('user'),
    status: joi.string().valid('active', 'inactive').default('active')
  });

  const { error, value } = body.validate(req.body);
  if (error) {
    return next(new appError(error.details[0].message, 400));
  }
  const user = await User.findOne({
    where: {
      email: value.email
    }
  });
  if (user) {
    return next(new appError(`${value.email} already exists`, 400));
  }
  const hashPassword = await bcrypt.hash(value.password, 12);
  value.password = hashPassword;
  const newUser = await User.create(value);
  createSendToken(newUser, 201, res)
});

const login = catchAsync(async (req, res, next) => {
  const email = req.body.email;
  const password = req.body.password;
  if (!email) {
    return next(new appError("Please provide an Email", 400))
  }
  else if (!password) {
    return next(new appError("Please provide a Password ", 400))
  }
  const user = await User.findOne({
    where: { email },
  });

  if (!user) {
    return next(new appError(`${email} doesn't exist `, 401))
  }
  if (user.status == 'inactive') {
    return next(new appError(`Authentication filed, Your account is inactive `, 401));
  }
  const isSame = await bcrypt.compare(password, user.password);
  if (isSame) {
    createSendToken(user, 201, res)
  }
  else {
    return next(new appError('Invalid credentials', 401))
  }
});

const logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

const changePassword = catchAsync(async (req, res, next) => {
  if (!req.body.password && req.body.newPassword) {
    return next(new appError('Please provaid current password and new password ', 400));
  }
  const user = await User.findOne({
    where: { id: req.user.id }
  });
  const isSame = await bcrypt.compare(req.body.password, user.password);

  if (!isSame) {
    return next(new appError('Incorrect current password ', 403));
  }
  // Hash the plain text password before saving it to database
  const hashPasswrod = await bcrypt.hash(req.body.newPassword, 12);
  user.update({ password: hashPasswrod }, {
    where: { id: req.user.id }
  });
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({
    status: 'success',
    message: 'password is changed please login with new password'
  });
});

const updateUser = catchAsync(async (req, res, next) => {
  const id = req.params.id;
  const user = await User.update(req.body, {
    where: {
      id
    }
  });
  if (!user) {
    return next(new appError('User not found', 404));
  }
  res.status(200).json({
    status: 'success',
    message: 'User updated successfully',
    data: user
  });
});

module.exports = {
  signup,
  login,
  logout,
  changePassword,
  updateUser
};