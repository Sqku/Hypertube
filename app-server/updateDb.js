const mongoose = require('mongoose');
const request = require('request');
const Promise = require('bluebird');

const config = require('./config/config');

// Models
const Movie = require('./models/movie');
const MovieTorrent = require('./models/movieTorrent');

// Configuration db
mongoose.Promise = Promise;
mongoose.connect(config.MONGO_URI);


// Update movies and movies torrents
const movie_api = 'https://yts.ag/api/v2/list_movies.json';
let pagesUrl = [];
let page = 1;
let maxPage = 0;
let json;

/*
const movieQueue = async.queue(function(url, done) {

});
*/

// Get movie count to get page count
request(movie_api + '?limit=1', function(err, res, body){
    if (err) {
        console.error(err);
        return false;
    }

    if (res.statusCode !== 200) {
        console.error(res.statusCode);
        return false;
    }

    json = JSON.parse(body);
    if (json.status !== "ok") {
        console.error(json.status_message);
        return false;
    }

    if (json.data === undefined) {
        console.error('No data found');
        return false;
    }

    maxPage = Math.ceil(json.data.movie_count / 50);

    while (page <= maxPage) {
        pagesUrl.push(movie_api + '?limit=50&page=' + page);
        page++;
    }
    Promise.each(pagesUrl, function(url){
        return new Promise(function(resolve, reject){
            request(url, function(err, res, body){
                if (err)
                    return reject(err);
                if (res.statusCode !== 200)
                    return reject(res.statusCode);

                let json = JSON.parse(body);

                if (json.status !== 'ok')
                    return reject(json.status_message);

                if (json.data === undefined)
                    return reject('No data');

                Promise.each(json.data.movies, function(movie){
                    return new Promise(function(resolve, reject){
                        // Save a movie
                        Movie.findOneAndUpdate(
                            { imdb_code: movie.imdb_code },
                            { $set: {
                                imdb_code: movie.imdb_code,
                                title: movie.title,
                                slug: movie.slug,
                                year: movie.year,
                                rating: movie.rating,
                                genres: movie.genres,
                                description_intro: movie.description_intro,
                                description_full: movie.description_full,
                                yt_trailer_code: movie.yt_trailer_code,
                                language: movie.language,
                                mpa_rating: movie.mpa_rating,
                                background_image: movie.background_image,
                                background_image_original: movie.background_image_original,
                                small_cover_image: movie.small_cover_image,
                                medium_cover_image: movie.medium_cover_image,
                                large_cover_image: movie.large_cover_image
                            } },
                            { upsert: true, new: true },
                            function(err, result) {
                                if (err)
                                    return reject(err);
                                let id = result._id;
                                // Save movie torrents
                                if (!movie.torrents)
                                    return resolve();

                                Promise.each(movie.torrents, function(torrent){
                                    return new Promise(function(resolve, reject){
                                        MovieTorrent.findOneAndUpdate(
                                            { hash: torrent.hash },
                                            { $set: {
                                                id_movie: id,
                                                url: torrent.url,
                                                hash: torrent.hash,
                                                quality: torrent.quality,
                                                seeds: torrent.seeds,
                                                peers: torrent.peers,
                                                size: torrent.size,
                                                size_bytes: torrent.size_bytes
                                            } },
                                            { upsert: true },
                                            function(err, result) {
                                                if (err)
                                                    return reject(err);
                                                resolve();
                                            }
                                        );
                                    });
                                })
                                .then(function() {
                                    return resolve();
                                })
                                .catch(function(err) {
                                    return reject(err);
                                });
                            }
                        );
                    });
                })
                .then(function(){
                    return resolve();
                })
                .catch(function(err){
                    return reject(err);
                });
            });
        });
    })
    .then(function() {
        console.log('Movies updated')
    })
    .catch(function(err) {
        console.error(err);
    });
});
