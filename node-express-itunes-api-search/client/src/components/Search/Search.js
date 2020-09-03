import React from 'react';

// <!---- STYLE SHEET ---->
import '../Search/Search.css';

// <!---- IMPORT REACT STRAP ---->
import { Button, Input, Nav, Form } from 'reactstrap';

// <!---- SEARCH FAVOURITES FUNCTION---->
function Search(props) {
  return (
    <Nav className='SearchForm'>
      <Form onSubmit={props.searchAPIitunes}>
        <Input
          type='text'
          name='term'
          placeholder='Search titles or genres...'
        ></Input>

        <select name='media'>
          <option value='all'>All</option>
          <option value='music'>Music</option>
          <option value='audiobook'>Audio Book</option>
          <option value='musicVideo'>Music Video</option>
          <option value='movie'>Movie</option>
          <option value='tvShow'>TV Show</option>
          <option value='podcast'>Podcast</option>
          <option value='ebook'>E Book</option>
        </select>
        <Button color='primary'>Search</Button>
      </Form>
    </Nav>
  );
}

export default Search;
