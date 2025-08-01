import handlebars from 'handlebars';
import dayjs from 'dayjs';

handlebars.registerHelper('json', (context) => {
  return new handlebars.SafeString(JSON.stringify(context));
});

handlebars.registerHelper('array', (context) => {
  return JSON.stringify(context).replace(/^\[(.*)\]$/, '[$1]');
});

handlebars.registerHelper('eq', function (a, b) {
  return a === b;
});

handlebars.registerHelper('gt', function (a, b) {
  return a > b;
});

handlebars.registerHelper('lt', function (a, b) {
  return a < b;
});

handlebars.registerHelper('ternary', function (condition, yes, no) {
  return condition ? yes : no;
});

handlebars.registerHelper('formatDate', function (dateString, format) {
  return dayjs(dateString).format(format);
});

handlebars.registerHelper('math', function (lvalue, operator, rvalue) {
  lvalue = parseFloat(lvalue);
  rvalue = parseFloat(rvalue);

  switch (operator) {
    case '+':
      return lvalue + rvalue;
    case '-':
      return lvalue - rvalue;
    case '*':
      return lvalue * rvalue;
    case '/':
      return lvalue / rvalue;
    case '%':
      return lvalue % rvalue;
    default:
      return NaN;
  }
});

handlebars.registerHelper('round', function (value, decimals) {
  return parseFloat(value).toFixed(decimals);
});

handlebars.registerHelper('inc', function (value, options) {
  return parseInt(value) + 1;
});

handlebars.registerHelper('dec', function (value, options) {
  return parseInt(value) - 1;
});

handlebars.registerHelper('concat', function (...args) {
  return args.slice(0, -1).join('');
});

handlebars.registerHelper(
  'formatCurrency',
  function (amount, currency, minDigit = 0, maxDigit = 2) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: maxDigit,
      minimumFractionDigits: minDigit,
    }).format(amount);
  }
);

handlebars.registerHelper('formatNumber', function (number, options) {
  return new Intl.NumberFormat('en-US', options).format(number);
});

handlebars.registerHelper('lowercase', function (str) {
  return str.toLowerCase();
});

handlebars.registerHelper('uppercase', function (str) {
  return str.toUpperCase();
});

handlebars.registerHelper('substring', function (str, start, end) {
  return str.substring(start, end);
});

handlebars.registerHelper('capitalize', function (str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
});

handlebars.registerHelper('times', function (n, block) {
  var acc = '';
  for (var i = 0; i < n; ++i) acc += block.fn(i);
  return acc;
});

handlebars.registerHelper('len', function (arr) {
  return Array.isArray(arr) ? arr.length : 0;
});

handlebars.registerHelper('isBefore', function (date1, date2) {
  return dayjs(date1).isBefore(dayjs(date2));
});

handlebars.registerHelper('isAfter', function (date1, date2) {
  return dayjs(date1).isAfter(dayjs(date2));
});
