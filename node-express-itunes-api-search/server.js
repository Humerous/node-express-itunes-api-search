const express = require('express');
const morgan = require('morgan');
const fetch = require('node-fetch');
const path = require('path');
const helmet = require('helmet');

const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/favourites/:term/:media', async (req, res, next) => {
  try {
    const { term, media } = req.params;
    const url = new URL('https://itunes.apple.com/search');

    url.searchParams.set('term', term);
    url.searchParams.set('media', media);
    url.searchParams.set('country', 'za');
    url.searchParams.set('limit', '50');

    const response = await fetch(url.toString());

    if (!response.ok) {
      return res.status(502).json({ error: 'iTunes Search API request failed.' });
    }

    const data = await response.json();
    return res.json(data.results || []);
  } catch (error) {
    return next(error);
  }
});

app.use(express.static(path.join(__dirname, 'public')));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client', 'build')));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something broke.' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

module.exports = app;
