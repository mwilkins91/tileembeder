const puppeteer = require('puppeteer');
const fs = require('fs');
let imageNum = 1;
const path = require('path');

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
		if (port === 5100) {
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

module.exports = function(io) {
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
};
