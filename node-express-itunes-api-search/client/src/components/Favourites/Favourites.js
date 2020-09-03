import React from 'react';

// <!---- STYLE SHEET ---->
import '../Favourites/Favourites.css';

// <!---- IMPORT REACT STRAP ---->
import { Table } from 'reactstrap';

// <!---- FONT AWESOME---->
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

// <!---- SELECTED FAVOURITES FUNCTION---->
function Favourites({ favourites, deleteFavourite }) {
  function selectGenre(kind) {
    if (kind == null || kind === '') {
      return '';
    }

    // <!---- FAVOURITES FOREACH ARRAY---->
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

  return (
    <div>
      <Table responsive hover variant='dark' size='md'>
        <thead className='TableHead'>
          <tr>
            <th colSpan='2'>Title</th>
            <th>Artist</th>
            <th colSpan='2'>Genre</th>
          </tr>
        </thead>
        <tbody>
          {favourites.map((favourite, index) => (
            <tr key={index}>
              <td colSpan='2'>{favourite.title}</td>
              <td>{favourite.artist}</td>
              <td>{selectGenre(favourite.kind)}</td>
              <td>
                <FontAwesomeIcon
                  icon={['fas', 'dumpster']}
                  className='fas fa-dumpster dumpsterBtn'
                  onClick={() => deleteFavourite(favourite.trackId)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default Favourites;
