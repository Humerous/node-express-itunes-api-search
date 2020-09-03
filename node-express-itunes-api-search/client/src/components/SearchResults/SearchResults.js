import React from 'react';

// <!---- STYLE SHEET ---->
import '../SearchResults/SearchResults.css';

//REACT-STRAP
import { Container, Row, Col } from 'reactstrap';

//FONT AWESOME
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// <!---- SEARCH RESULTS FUNCTION---->
function SearchResults({ results, err, addFavourites, favourites }) {
  function selectGenre(kind) {
    if (kind == null || kind === '') {
      return '';
    }
    // <!---- SEARCH RESULTS FOREACH ARRAY---->
    const arraySplit = kind.split('-');
    let result = '';
    arraySplit.forEach((item, index) => {
      result += item[0].toUpperCase() + item.substring(1);
      if (index !== arraySplit.length - 1) {
        result += ' ';
      }
    });
    return result;
  }

  // <!---- SLECTED FAVOURITES FUNCTION ---->
  function isFavourite(trackId) {
    if (favourites.some((fav) => fav.trackId === trackId)) {
      return '#ec0101';
    } else {
      return 'white';
    }
  }

  return (
    <Container fluid>
      {err && <p className='ResultAllError'>{err}</p>}
      <Row xs={1} md={2} lg={3}>
        {results.map((result, index) => (
          <Col key={index} className='ResultOuterContainer'>
            <img
              className='ResultSmallImg'
              src={result.artworkUrl100}
              alt='search-result'
            />
            <div className='ResultAllDetails ml-2'>
              <p className='ResultsAllTitle'>{result.trackName}</p>
              <p className='ResultsAllImage'>{result.artistName}</p>
              <p className='ResultsAllMedia'>{selectGenre(result.kind)}</p>
            </div>
            <div className='ResultAllBtn mr-2'>
              <FontAwesomeIcon
                icon={['fas', 'thumbs-up']}
                className='fas fa-thumbs-up thumbBtn ml-2'
                onClick={() => addFavourites(result)}
                style={{ color: isFavourite(result.trackId) }}
              />
            </div>
          </Col>
        ))}
      </Row>
    </Container>
  );
}

export default SearchResults;
