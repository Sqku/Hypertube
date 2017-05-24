const torrentStream = require('torrent-stream');
const fs = require('fs');
const http = require('http');
const url = require('url');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const pump = require('pump');
const request = require('request');
const MovieTorrent = require('../models/movieTorrent');
const OS = require('opensubtitles-api');
const OpenSubtitles = new OS({
    useragent:'UserAgent',
    username: 'sqku',
    password: 'hypertube123',
});
const EpisodeTorrent = require('../models/episodeTorrent');

module.exports.movieStream = function(req, res, next){
    if (!req.params.torrentid)
        return res.status(401).json('No torrent magnet found');

    MovieTorrent.findOneAndUpdate(
        { _id: req.params.torrentid },
        { $set: { lastView: Date.now() } },
        { upsert: false, new: true },
        function(err, torrent){
            if (err) return res.status(500).json('Server error');

            if (!torrent) return res.status(401).json('Torrent not valid');

            req.torrent = torrent;
            req.torrentType = 'movie';
            return next();
        }
    );

};

module.exports.showStream = function(req, res, next){
    if (!req.params.torrentid)
        return res.status(401).json('No torrent magnet found');

    EpisodeTorrent.findOneAndUpdate(
        { _id: req.params.torrentid },
        { $set: { lastView: Date.now() } },
        { upsert: false, new: true },
        function(err, torrent){
            if (err) return res.status(500).json('Server error');

            if (!torrent) return res.status(401).json('Torrent not valid');

            req.torrent = torrent;
            req.torrentType = 'show';
            return next();
        }
    );

};

module.exports.streamFile = function(req, res) {
    const filename = req.torrent._id,
        torrentUrl = req.torrent.url;

    /*if (req.torrent.seeds === 0)
        return res.status(401).json('No seeds');*/

    let filepath = __dirname + '/../videos/' + filename,
        videoFile,
        videoExt,
        test = 0,
        videoLength,
        range,
        positions,
        start,
        end,
        chunksize,
        mimetype,
        contentType;

    console.log(torrentUrl);

    engine = torrentStream(torrentUrl, {
        connections: 3000,
        uploads: 10,
        tmp: filepath,
        path: filepath,
        verify: true,
        dht: true,
        tracker: true,
        trackers: [
            'udp://tracker.openbittorrent.com:80',
            'udp://tracker.ccc.de:80'
        ]
    });

    engine.on('ready', function(){
        if (engine.files.length === 0) {
            console.log("No peers");
            return res.status(401).json("No peers");
        }


        engine.files.forEach(function(file){
            let ext = path.extname(file.name);
            if (['.mp4', '.mkv', '.avi'].indexOf(ext) !== -1) { // If one of this ext
                videoFile = file;
                videoExt = ext;
                return false;
            }
        });

        videoLength = videoFile.length;
        if (req.headers.range) {
            range = req.headers.range;
            let seen = Math.round(videoLength * 0.85);

            positions = range.replace(/bytes=/, '').split('-');
            start = parseInt(positions[0], 10);
            end = positions[1] ? parseInt(positions[1], 10) : videoLength - 1;

            chunksize = end - start + 1;
            mimetype = path.extname(videoFile.name);

            contentType = 'video/' + videoExt === '.webm' ? 'webm' : 'mp4';
            res.writeHead(206, {
                'Content-Range': `bytes ${start} - ${end} / ${videoLength}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
            });

            stream = videoFile.createReadStream({start: start, end: end});

            stream.on('error', function(err){
                console.log(err);
            });

            if (['.webm', '.mp4'].indexOf(videoExt) === -1) { // If not one of this ext
                try {
                    ffmpeg(stream).videoCodec('libvpx').audioCode('libvorbis').format('mp4')
                        .audioBitrate(128)
                        .videoBitrate(1024)
                        .outputOptions(['-threads 8', '-deadline realtime', '-error-resilient 1']);
                } catch (err) {
                    console.error(err);
                }
            }

            pump(stream, res);
        } else {
            res.writeHead(200, {
                'Content-Length': videoLength,
                'Content-Type': 'video/mp4'
            });
            stream = videoFile.createReadStream({test, videoLength});
            pump(stream, res);
        }
    });

    engine.on('download', function() {
        console.log(Math.round((engine.swarm.downloaded / videoFile.length) * 100)+"% downloaded for : ", videoFile.path);
        //Something to do while downlaoding
        // Maybe socket.emit to room watching this movie
    });

    engine.on('idle', function(){
        console.log('Download finish');
        // File finish download
    })

};


module.exports.subtitles = function (req, res) {

    OpenSubtitles.search({
        // hash: req.body.hash,
        imdbid: req.body.imdb_code,
        sublanguageid: 'fre',
        gzip: true
    }).then(subtitles => {
        if (subtitles.fr) {
            console.log('Subtitle found:', subtitles);
            require('request')({
                url: subtitles.fr.url,
                encoding: null
            }, (error, response, data) => {
                if (error) throw error;
                require('zlib').unzip(data, (error, buffer) => {
                    if (error) throw error;
                    const subtitle_content = buffer.toString(subtitles.fr.encoding);
                    console.log('Subtitle content:', subtitle_content);
                });
            });
        } else {
            throw 'no subtitle found';
        }
    }).catch(console.error);
};