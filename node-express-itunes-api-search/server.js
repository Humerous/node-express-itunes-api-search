const express = require('express');
const app = express();
const fileHandler = require('fs');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const fetch = require('node-fetch');
const Path = require('path');

//<---- HELMET SECURITY ---->
const helmet = require('helmet');
app.use(helmet());

// FILE PATH
const filePath = Path.join(__dirname, 'public', 'selectedFavourites.json');

// All FAVOURITES
const data = JSON.parse(fileHandler.readFileSync(filePath));

// <---- MIDDLEWARE  ---->
app.use(express.static('public'));
app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// <----GET FUNCTION ---->
app.get('/api/favourites/:term/:media', (req, res) => {
  const { term, media } = req.params;
  fetch(
    `https://itunes.apple.com/search?term=${term}&media=${media}&country=za&limit=50`
  )
    .then((res) => res.json())
    .then((data) => res.send(data.results))
    .catch((err) => console.log(err));
});

// <---- GET (SEND ALL JSON DAT TO CLIENT) ---->
app.get('/api/favourites', (req, res) => {
  res.send(data);
});

// <---- POST FUNCTION ---->
app.post('/api/favourites', (req, res) => {
  const updatedItem = req.body;
  data.push(updatedItem);

  fileHandler.writeFile(filePath, JSON.stringify(data), (err, data) => {
    if (err) throw err;
    res.send(updatedItem);
  });
});

// <----DELETE FUNCTION ---->
app.delete('/api/favourites', (req, res) => {
  fileHandler.readFile(filePath, (err, data) => {
    if (err) {
      res.send('Error,  First post.');
    } else {
      var existingData = JSON.parse(data);
    }
    var updatedData = existingData.filter(
      (item) => item.trackId !== Number(req.param('track-id'))
    );
    fileHandler.writeFile(filePath, JSON.stringify(updatedData), (err) => {
      if (err) throw err;
      res.send(updatedData);
    });
  });
});

// <---- CATCH ERROR MESSAGE ---->
app.use(function (err, req, res, next) {
  console.log(err.stack);
  res.status(500).send('Something broke!');
});

// <----CHANGE EXPRESS ---->
const path = require('path');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

// <----SERVER PORT LISTENING ON 3001 ---->
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
