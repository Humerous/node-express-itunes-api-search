import React from 'react';
import App from './App';
import { configure, shallow } from 'enzyme';
import renderer from 'react-test-renderer';
import Adapter from 'enzyme-adapter-react-16';

// <!---- IMPORT COMPONENTS ---->
import Search from './components/Search/Search';
import SearchResults from './components/SearchResults/SearchResults';
import Favourites from './components/Favourites/Favourites';

test('renders correctly', () => {
  const tree = renderer.create(<Search />).toJSON();

  expect(tree).toMatchSnapshot();
});
test('renders correctly', () => {
  const tree = renderer.create(<SearchResults />).toJSON();

  expect(tree).toMatchSnapshot();
});
test('renders correctly', () => {
  const tree = renderer.create(<Favourites />).toJSON();

  expect(tree).toMatchSnapshot();
});

configure({ adapter: new Adapter() });

describe('<App /> with no props', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = shallow(<App />);
  });

  it('should match the snapshot', () => {
    expect(wrapper.html()).toMatchSnapshot();
  });

  it('should render properly', () => {
    const tree = renderer.create(<App />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
