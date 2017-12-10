const express = require('express');
const app = express();
const path = require('path');
const puppeteer = require('puppeteer');
const escapeHtml = require('escape-html');
const fs = require('fs');
let imageNum = 1;
const port = process.env.PORT || 8080;
const mustacheExpress = require('mustache-express');
const promisify = require('es6-promisify');
const promRequest = promisify(require('request'));
const request = require('request');
const zipFolder = promisify(require('zip-folder'));
const writeFile = promisify(fs.writeFile);

const stream = function writeToFile(filePath) {
	return new Promise((resolve, reject) => {
		const file = fs.createWriteStream(filePath);
		file.on('finish', resolve); // not sure why you want to pass a boolean
		file.on('error', reject); // don't forget this!
	});
};
fs.readdir('imgs', (err, files) => {
	if (err) {
		console.error(err);
	} else {
		imageNum = files.length;
	}
});

function makeEmbed({ url, src, height, width }) {
	const embedTemplate = `
    <a href="${url}"
        target="_blank">
        <img src="${src}"
            alt="Shopify Mobile Updates: Discounts, Product Collections, Live View, and More"
            width="${width}"
            height="${height}" 
        />
    </a>
    `;
	return embedTemplate.replace(/\s+/g, ' ');
}

const emptyFolder = function(directory) {
	fs.readdir(directory, (err, files) => {
		if (err) throw err;

		for (const file of files) {
			fs.unlink(path.join(directory, file), err => {
				if (err) throw err;
			});
		}
	});
};

async function zipAndSend(req, res, next) {
	try {
		if (!fs.existsSync(path.resolve(__dirname, 'zips'))) {
			fs.mkdirSync(path.resolve(__dirname, 'zips'));
		}
		let zip = await zipFolder(
			path.resolve(__dirname, 'assets'),
			path.resolve(__dirname, 'zips', 'assets.zip')
		);
		emptyFolder(path.resolve(__dirname, 'assets'));
		next();
	} catch (err) {
		console.log(err);
		res.send(500).send('another fail!');
	}
}

async function stealAssets(req, res, next) {
	try {
		let styles = req.assets.stylesheet || [];
		let images = req.assets.image || [];
		let fonts = req.assets.font || [];
		let scripts = req.assets.script || [];
		let textFiles = [...styles, ...scripts];
		let otherFiles = [...images, ...fonts];
		let streamPromises = [];
		otherFiles.forEach((asset, i) => {
			let fileName = otherFiles[i].split('/');
			fileName = fileName[fileName.length - 1];
			let extension = fileName.split('.');
			extension = extension[extension.length - 1];
			if (fileName.length > 50) {
				fileName = `fileNameTooLong${i}.${extension}`;
			}
			if (!fs.existsSync(path.resolve(__dirname, 'assets'))) {
				fs.mkdirSync(path.resolve(__dirname, 'assets'));
			}
			let fileStream = request(asset).pipe(
				fs.createWriteStream(path.resolve(__dirname, 'assets', fileName))
			);
			streamPromises.push(
				new Promise((resolve, reject) => {
					fileStream.on('finish', _ => resolve(true));
					fileStream.on('error', err => reject(err));
				})
			);
		});
		let requestPromises = textFiles.map(asset => promRequest(asset));
		let requestResponses = await Promise.all(requestPromises);
		let writePromises = [];
		requestResponses.forEach((file, i) => {
			let fileName = textFiles[i].split('/');
			fileName = fileName[fileName.length - 1];
			writePromises.push(
				writeFile(path.resolve(__dirname, 'assets', fileName), file.body)
			);
		});

		let allProms = [...writePromises, ...streamPromises];
		let allResults = await Promise.all(allProms);
		next();
	} catch (err) {
		console.log(err);
		res.status(500).send('fail');
	}
}

async function getAssetsManifest(req, res, next) {
	const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
	const page = await browser.newPage();
	let queryUrl = req.query.url;
	const assets = {};
	page.on('request', request => {
		if (!assets[request.resourceType]) {
			assets[request.resourceType] = [];
		}

		assets[request.resourceType].push(request.url);
	});

	await page.goto(`${queryUrl}`, { waitUntil: 'networkidle2' });

	await browser.close();

	req.assets = assets;
	next();
}

async function screenshotDOMElement(page, selector, padding = 0) {
	try {
		const rect = await page.evaluate(selector => {
			const element = document.querySelector(selector);
			const { x, y, width, height } = element.getBoundingClientRect();
			return { left: x, top: y, width, height, id: element.id };
		}, selector);

		await page.screenshot({
			path: `./imgs/image${imageNum}.png`,
			clip: {
				x: rect.left - padding,
				y: rect.top - padding,
				width: rect.width + padding * 2,
				height: rect.height + padding * 2
			}
		});

		let appUrl = 'https://fooling-around-with-node.herokuapp.com/';
		if (port === 5100 || port === 8080) {
			appUrl = '/';
		}

		return {
			width: rect.width + padding * 2,
			height: rect.height + padding * 2,
			src: `${appUrl}image${imageNum}.png`
		};
	} catch (err) {
		console.error(err);
		return false;
	}
}

const initScreenshot = async function(req, res, next) {
	try {
		const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
		const page = await browser.newPage();
		let queryUrl = req.query.url;

		await page.goto(`${queryUrl}?embedtile`, { waitUntil: 'networkidle2' });

		let screenshotData = await screenshotDOMElement(page, '.tile');

		//if the screenshot fails
		if (!screenshotData) {
			res.status(500);
			res.json({
				message: 'An Error has occured.'
			});
		}
		screenshotData.url = queryUrl;

		await browser.close();

		req.userRequestedString = makeEmbed(screenshotData);
		next();
	} catch (err) {
		console.error(err);
		res.status(500);
		res.json({
			message: 'An Error has occured.'
		});
	}
};

app.use(express.static('imgs'));
app.use(express.static('public'));
// Register '.mustache' extension with The Mustache Express
app.engine('mustache', mustacheExpress());

app.set('view engine', 'mustache');
app.set('views', __dirname + '/views');

// routes
app.get('/getEmbed', initScreenshot, function(req, res, next) {
	res.status(200);
	res.render('result', {
		userRequestedString: req.userRequestedString
	});
});

app.get('/assets', getAssetsManifest, stealAssets, zipAndSend, function(
	req,
	res,
	next
) {
	res.status(200);
	res.sendFile(path.resolve(__dirname, 'zips', 'assets.zip'));
	emptyFolder(path.resolve(__dirname, 'zips'));
});

app.get('/', function(req, res, next) {
	res.status(200);
	res.render('form', {
		formTitle: 'Uberflip Item Url:',
		formTarget: '/getEmbed'
	});
});

app.get('/getAssets', function(req, res, next) {
	res.status(200);
	res.render('form', {
		formTitle: 'Steal the assets from:',
		formTarget: '/assets'
	});
});

app.listen(port, function() {
	console.log(`App is now listening on port ${port}!`);
});
