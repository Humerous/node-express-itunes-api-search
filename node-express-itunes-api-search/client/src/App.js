import React from 'react';
import axios from 'axios';

import './App.css';

import { Container, Col, Row } from 'reactstrap';

import Search from './components/Search/Search';
import SearchResults from './components/SearchResults/SearchResults';
import Favourites from './components/Favourites/Favourites';

import { library } from '@fortawesome/fontawesome-svg-core';
import { faThumbsUp, faDumpster } from '@fortawesome/free-solid-svg-icons';
library.add(faThumbsUp, faDumpster);

const FAVOURITES_STORAGE_KEY = 'itunes-api-search-favourites';

class App extends React.Component {
  state = {
    results: [],
    favourites: [],
    error: undefined,
  };

  componentDidMount() {
    try {
      const stored = window.localStorage.getItem(FAVOURITES_STORAGE_KEY);
      const favourites = stored ? JSON.parse(stored) : [];
      this.setState({ favourites: Array.isArray(favourites) ? favourites : [] });
    } catch (error) {
      console.log(error);
      this.setState({ error, favourites: [] });
    }
  }

  persistFavourites = (favourites) => {
    window.localStorage.setItem(
      FAVOURITES_STORAGE_KEY,
      JSON.stringify(favourites)
    );
  };

  addFavourites = (result) => {
    const newFavourite = {
      trackId: result.trackId,
      title: result.trackName,
      artist: result.artistName,
      kind: result.kind,
    };

    const exists = this.state.favourites.some(
      (item) => item.trackId === newFavourite.trackId
    );

    if (exists) return;

    const favourites = [...this.state.favourites, newFavourite];
    this.persistFavourites(favourites);
    this.setState({ favourites });
  };

  deleteFavourite = (trackId) => {
    const favourites = this.state.favourites.filter(
      (item) => item.trackId !== trackId
    );

    this.persistFavourites(favourites);
    this.setState({ favourites });
  };

  searchAPIitunes = async (e) => {
    e.preventDefault();
    const term = e.target.term.value;
    const media = e.target.media.value;

    axios
      .get(`/api/favourites/${encodeURIComponent(term)}/${encodeURIComponent(media)}`)
      .then((response) => {
        this.setState({ results: response.data, error: undefined });
      })
      .catch((error) => {
        console.log(`Error message: ${error}`);
        this.setState({ error });
      });
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
