# Calendar RSS Feed Generator

This project is an RSS feed generator designed for deployment on the edge.

## Motivation

This RSS feed generator lets you read your calendar from a feature phone, like a simple Nokia.

You can add events to your calendar using [cal.com](https://cal.com). cal.com allows other people to book time-slots into your calendar quickly.

## How to Use

To access the RSS feed generated for your calendar, you need to use the `calendar-feed` endpoint. This endpoint is protected and requires an API key for authorization.

Here’s an example of how to format the request URL to fetch your calendar’s RSS feed:

```
https://your-deployment-url.vercel.app/calendar-feed?api_key=YOUR_API_KEY_HERE
```

Replace `YOUR_API_KEY_HERE` with your unique API key. Using the correct API key will allow the RSS feed to display events from your personal calendar, making it accessible from various devices and applications.

### One-Click Deploy

Deploy this RSS feed generator using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=vercel-examples):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/examples/tree/main/edge-functions/calendar-rss&project-name=calendar-rss-generator&repository-name=calendar-rss-generator)
