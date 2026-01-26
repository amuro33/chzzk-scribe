const https = require('https');

const url = "https://api.chzzk.naver.com/service/v1/channels/b9aaf994ef78a06ed689f23a77f863af/videos?sortType=LATEST&pagingType=PAGE&page=0&size=18&publishDateAt=&videoType=";

https.get(url, {
    headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
}, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json.content && json.content.data) {
                console.log("Total items:", json.content.data.length);
                json.content.data.slice(0, 3).forEach((item, index) => {
                    console.log(`\n[Item ${index}]`);
                    console.log("Title:", item.videoTitle);
                    console.log("VideoNo:", item.videoNo);
                    console.log("Thumbnail:", item.thumbnailImageUrl);
                    console.log("LiveThumbnail:", item.liveThumbnailImageUrl); // Checking alternative fields
                });
            } else {
                console.log("Structure unexpected:", Object.keys(json));
            }
        } catch (e) {
            console.error("Parse error:", e);
            console.log("Raw data:", data.substring(0, 200));
        }
    });
}).on('error', (e) => {
    console.error("Request error:", e);
});
