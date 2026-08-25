# Apple storefront source

MediaShelf does not treat the complete ISO 3166 country list as equivalent to
Apple media-service availability.

During V2 setup, `npm run storefronts:update` reads the current Apple Support
page:

https://support.apple.com/en-hk/118205

The generated source groups countries/regions under Apple's six published
regional headings.

The iTunes Search API remains storefront-specific:

https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html

Apple's archived Search API documentation states an approximate limit of
20 calls per minute and recommends caching.
