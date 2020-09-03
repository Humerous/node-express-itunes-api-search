import React from 'react';
import axios from 'axios';

// <!---- STYLE SHEET ---->
import './App.css';

// <!---- IMPORT REACT STRAP ---->
import { Container, Col, Row } from 'reactstrap';

// <!---- IMPORT COMPONENTS ---->
import Search from './components/Search/Search';
import SearchResults from './components/SearchResults/SearchResults';
import Favourites from './components/Favourites/Favourites';

// <!---- FONT AWESOME SCRIPT ---->
import { library } from '@fortawesome/fontawesome-svg-core';
import { faThumbsUp, faDumpster } from '@fortawesome/free-solid-svg-icons';
library.add(faThumbsUp, faDumpster);

class App extends React.Component {
  state = {
    results: [],
    favourites: [],
    error: undefined,
  };

  // ONLOAD FUNCTION
  componentWillMount = () => {
    axios.get('/api/favourites').then(
      (response) => {
        console.log(response.data);
        this.setState({
          favourites: response.data,
        });
      },
      (error) => {
        console.log(error);
        this.setState({
          error,
          favourites: [],
        });
      }
    );
  };

  //POST NEW FAVOURITE
  addFavourites = (result) => {
    axios
      .post('/api/favourites', {
        trackId: result.trackId,
        title: result.trackName,
        artist: result.artistName,
        kind: result.kind,
      })
      .then((response) => {
        const newFavourites = [...this.state.favourites];
        newFavourites.push(response.data);
        this.setState({ favourites: newFavourites });
      })
      .catch((error) => console.log(`${error}`));
  };

  //DELETE FAVOURITES
  deleteFavourite = (trackId) => {
    axios
      .delete('/api/favourites', { params: { 'track-id': trackId } })
      .then((res) => {
        const filteredFavourites = this.state.favourites.filter(
          (item) => item.trackId !== trackId
        );
        this.setState({ favourites: filteredFavourites });
      })
      .catch((error) => console.log(`Error message: ${error}`));
  };

  ////SEARCH ITUNE FUNCTION
  searchAPIitunes = async (e) => {
    e.preventDefault();
    const term = e.target.term.value;
    const media = e.target.media.value;
    axios
      .get(`/api/favourites/${term}/${media}`)
      .then((response) => {
        this.setState({ results: response.data });
      })
      .catch((error) => console.log(`Error message: ${error}`));
  };

  render() {
    return (
      <Container fluid>
        <Row>
          <Col sm={8} md={8} lg={8}>
            <div className='SearchOuterShell'>
              <div className='SearchOuterContent'>
                <div className='SearchOuterHeader'>
                  <h1 className='SearchOuterHeading'>Search</h1>
                  <Search searchAPIitunes={this.searchAPIitunes} />
                </div>
                <SearchResults
                  results={this.state.results}
                  error={this.state.error}
                  addFavourites={this.addFavourites}
                  favourites={this.state.favourites}
                />
              </div>
            </div>
          </Col>

          <Col sm={4} md={4} lg={4}>
            <div className='FavOuterShell'>
              <div className='FavOuterContent'>
                <div className='FavOuterHeader'>
                  <h1 className='FavHeading'>Favourites</h1>
                </div>
                <Favourites
                  favourites={this.state.favourites}
                  deleteFavourite={this.deleteFavourite}
                />
              </div>
            </div>
          </Col>
        </Row>
      </Container>
    );
  }
}

export default App;
