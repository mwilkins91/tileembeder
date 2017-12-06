const express = require('express');
const app = express();
const path = require('path');
const puppeteer = require('puppeteer');
const escapeHtml = require('escape-html');
const fs = require('fs');
let imageNum = 1;
const port = process.env.PORT || 8080;
const mustacheExpress = require('mustache-express');

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

app.get('/', function(req, res, next) {
	res.status(200);
	res.render('form');
});

app.listen(port, function() {
	console.log(`App is now listening on port ${port}!`);
});
