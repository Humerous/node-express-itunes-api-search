# Simple Node js with Express Server with REST API

A simple app with the the uses Express server offering a REST API with Node.js.

Deployed here: https://node-express-itunes-api-search.herokuapp.com/

### Table of Contents

You're sections headers will be used to reference location of destination.

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [GET Routes](#getroutes)
- [Beyond GET Routes](#beyondgetroutes)
- [Postman](#postman)
- [References](#references)
- [License](#license)
- [Author Info](#author-info)

## Features

- Node js
- Express
- itunes-search-api
- Fetch API

## Requirements

- [node & npm](https://nodejs.org/en/)

## Installation

`01.\DOWNLOAD THE ZIP REPOSITORT`
`02.\_UNZIP`
`03.\_CD INTO PROJECT`
`04.\_NPM INSTALL`
`05.\_CD INTO PROJECT IN CLIENT FOLDER`
`06.\_NPM INSTALL`
`07.\CD OUT AND BACK INTO ROOT FOLDER`
`08.\_NPM RUN DEV - USING CONCURRENTLY TO RUN BOTH SERVERS IN ONE COMMAND`
`10.\_ENJOY!`

`OR`

`01.\DOWNLOAD THE ZIP REPOSITORT`
`02.\_UNZIP`
`03.\_CD INTO PROJECT`
`04.\_NPM INSTALL`
`05.\_NPM START`
`06.\_CD INTO PROJECT IN CLIENT FOLDER`
`07.\_NPM INSTALL`
`08.\_NPM START`
`09.\_ENJOY!`

`11.\ NB ** If having trouble with dual servers running : run this command "sudo killall -9 node!" to kill all servers. **`

### GET Routes

- visit http://localhost:3000

  - /api/favourites
  - /api/favourites/1

### Beyond GET Routes

#### CURL

- Create a new weblist with:
  - `curl -X POST -H "Content-Type:application/json" http://localhost:3000/api/favourites/`
  - Update a new weblist with:
  - `curl -X PUT -H "Content-Type:application/json" http://localhost:3000/api/favourites/`
- Delete a message with:
  - `curl -X DELETE -H "Content-Type:application/json" http://localhost:3000/api/favourites/1`

#### Postman

- Install [Postman](https://www.getpostman.com/apps) to interact with REST API
- Create a message with:
  - URL: http://localhost:3000/api
  - Method: POST
  - Body: raw + JSON (application/json)
  - Update a message with:
  - URL: http://localhost:3000/api/favourites/1
  - Method: PUT
- Delete a message with:
  - URL: http://localhost:3000//api/favourites/1
  - Method: DELETE

## References

Hyperion Development Bootcamp

[Back To The Top](#read-me-template)

---

## License

MIT License

Copyright (c) [2020][david k miller]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

[Back To The Top](#read-me-template)

---

## Author Info

- Twitter - [@DavidMillerster](https://twitter.com/DavidMillerster)

[Back To The Top](#read-me-template)
