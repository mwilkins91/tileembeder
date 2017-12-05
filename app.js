const express = require('express');
const app = express();
const path = require('path');
const puppeteer = require('puppeteer');
const escapeHtml = require('escape-html');

function makeEmbed({ url, src, height, width }) {
	const embedTemplate = `
    <a href="${url}"
        target="_blank">
        <img src="${src}"
            alt="Shopify Mobile Updates: Discounts, Product Collections, Live View, and More" width="${
													width
												}" height="${height}">
    </a>
    `;
	return embedTemplate.replace(/\s+/g, ' ');
}

async function screenshotDOMElement(page, selector, padding = 0) {
	try {
		console.log('yey');
		const rect = await page.evaluate(selector => {
			const element = document.querySelector(selector);
			const { x, y, width, height } = element.getBoundingClientRect();
			return { left: x, top: y, width, height, id: element.id };
		}, selector);
		await page.screenshot({
			path: './imgs/example.png',
			clip: {
				x: rect.left - padding,
				y: rect.top - padding,
				width: rect.width + padding * 2,
				height: rect.height + padding * 2
			}
		});
		return {
			width: rect.width + padding * 2,
			height: rect.height + padding * 2,
			src: '/example.png'
		};
	} catch (err) {
		console.error(err);
	}
}

const initScreenshot = async function(req, res, next) {
	try {
		const browser = await puppeteer.launch();
		const page = await browser.newPage();
		await page.goto(`${req.query.url}?embedtile`, { waitUntil: 'networkidle2' });
		let screenshotData = await screenshotDOMElement(page, '.tile');
		screenshotData.url = req.query.url;
		await browser.close();
		req.userRequestedString = makeEmbed(screenshotData);
		next();
	} catch (err) {
		console.error(err);
	}
};

app.use(express.static('imgs'));

app.get('/getEmbed', initScreenshot, function(req, res, next) {
	res.send(`
    <div style="display: flex;">
        <div style="padding: 20px;">
            <p>Example: </p>
            ${req.userRequestedString}
        </div>

        <div style="padding: 20px;">
            <p>Your html:</p>
            <p>${escapeHtml(req.userRequestedString)}<p>
        </div>
    </div>
    `);
});

app.get('/', function(req, res, next) {
	res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.listen(process.env.PORT || 8080, function() {
	console.log('App is now listening on port 8080!');
});
