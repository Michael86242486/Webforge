const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '../public')));

const inquiryRouter = require('./routes/inquiry');
const githubRouter = require('./routes/github');
const errorHandler = require('./middleware/errorHandler');

app.use('/api/inquiry', inquiryRouter);
app.use('/api/github', githubRouter);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeForge server running on http://0.0.0.0:${PORT}`);
});