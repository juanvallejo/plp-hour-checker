#!/usr/bin/env node

// define runtime consts
var SERVER_HOST             = process.env.OPENSHIFT_NODEJS_IP   || '127.0.0.1';
var SERVER_PORT             = process.env.OPENSHIFT_NODEJS_PORT || 8000;

var fs   = require('fs');
var http = require('http');
var io   = require('socket.io');

var Multiparty = require('multiparty');
var Jsdom     = require('node-jsdom');

var app = http.createServer(function(req, res) {

    if(req.url == '/' || req.url == '/index.html') {
        return fs.readFile(__dirname + '/index.html', function(err, data) {
            
            if(err) {
                console.log('Error reading requested path', req.url);
                return res.end(data);
            }

            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(data);

        });
    }

    if(req.url == '/upload' && req.method == 'POST') {
        
        var form = new Multiparty.Form();
        return form.parse(req, function(err, fields, files) {

            if(err) {
                console.log('Content type =', req.headers);
                console.log('ERR MULTIPARTY', err);
                return res.end('An error occurred while uploading your file, please try again.');
            }

            if(!files.excel) {
                console.log('Unexpected fileformname from client.');
                return res.end('Unexpected client filename. Please try again.');
            }

            fs.readFile(files.excel[0].path, function(err, data) {

                if(err) {
                    console.log('ERR MULTIPART', err);
                    return res.end('Error parsing file');
                }

                var doc = data.toString().split('<body>');
                if(!doc.length || !doc[1]) {
                    return res.end('Invalid doc type');
                }

                doc = doc[1].split('</body>')[0];
                if(!doc) {
                    return res.end('Invalid doc type');
                }
                
                parseDocData(doc, function(data) {
                    res.end(JSON.stringify(data));
                });

            });

        });

    }

    res.end('Error 404. The page you are looking for could not be found.');

});

app.listen(SERVER_PORT, SERVER_HOST);

io.listen(app).on('connection', function(client) {
    console.log('Client', client.id, 'has connected.');

    // emit id to client
    client.emit('id', {body: client.id});
});

function parseDocData(html, callback) {

    var response = {};

    try {
        
        var document = Jsdom.jsdom(html);
        var table = document.getElementsByTagName('table').item(0);
        var cols = table.getElementsByTagName('tr');

        var validCols = [];
        var validCountCols = [];
        var validRows = [];
        var totalHourCount = 0;
        var totalSemesterHourCount = 0;
        var totalYearHourCount = 0;
        var beginYearDate = new Date('2015,8,18');
        var beginSemDate = new Date('2016,1,1');
        for(var i = 1; i < cols.length; i++) {
            var row = cols.item(i).getElementsByTagName('td');
            var dateString = row.item(14).innerHTML;
            var dateStringArr = dateString.split('/');
            var rowDate = new Date(dateStringArr[2] + ',' + dateStringArr[1] + ',' + dateStringArr[0]);
            totalHourCount += parseFloat(row.item(13).innerHTML);
            validRows.push(cols.item(i));
            validCountCols.push(cols.item(i).getElementsByTagName('td').item(13))
            validCols.push({
                name: row.item(1).innerHTML,
                date: rowDate
            });
            if(rowDate.getTime() >= beginYearDate.getTime()) {
                totalYearHourCount += parseFloat(row.item(13).innerHTML);
            }
            if(rowDate.getTime() >= beginSemDate.getTime()) {
                totalSemesterHourCount += parseFloat(row.item(13).innerHTML);
            }
        }

        response = {
            error: false,
            message: '',
            name: (validCols[0].name || ''),
            hours: {
                semester: totalSemesterHourCount,
                year: totalYearHourCount,
                total: totalHourCount
            }
        };

    } catch(e) {
        console.log('JSDOM PARSE', e);
        response = {
            error: true,
            message: e.toString()
        }
    }

    callback.call(this, response);

}