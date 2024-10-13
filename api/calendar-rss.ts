import "dotenv/config";
import axios from "axios";
import ICAL from "ical.js";
import { create } from "xmlbuilder2";

const API_KEY = process.env.API_KEY!;

export const config = {
  runtime: "edge",
};

function getEventUrl(vevent: ICAL.Component): string | null {
  const url = vevent.getFirstPropertyValue("X-GOOGLE-CALENDAR-CONTENT-URL");
  return typeof url === "string" ? url : null;
}

function addField<T, K extends keyof T>(
  target: T,
  source: ICAL.Event,
  key: K,
  getValue: () => any,
) {
  const value = getValue();
  if (value != null) {
    target[key] = value;
  }
}

async function fetchCalendarEvents(icalUrl: string): Promise<ICAL.Event[]> {
  const response = await axios.get(icalUrl);
  const jcalData = ICAL.parse(response.data);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");

  return vevents.map((vevent) => new ICAL.Event(vevent));
}

function createRssItem(event: ICAL.Event): any {
  const eventUrl = getEventUrl(event.component);
  const item: any = {
    title: event.summary,
    description: event.description || "",
    pubDate: event.startDate.toJSDate().toUTCString(),
  };

  addField(item, event, "link", () => eventUrl);
  addField(item, event, "location", () => event.location);
  addField(item, event, "organizer", () => event.organizer?.toString());
  addField(item, event, "attendees", () =>
    event.attendees?.map((attendee) => attendee.toString()),
  );

  return item;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const apiKey = url.searchParams.get("api_key");

  if (apiKey !== API_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const icalUrls = process.env.ICAL_URLS
    ? JSON.parse(process.env.ICAL_URLS)
    : [];

  try {
    const events = await Promise.all(icalUrls.map(fetchCalendarEvents));
    const allEvents = events.flat();

    const rssObject = {
      rss: {
        "@version": "2.0",
        channel: {
          title: "Personal Calendar",
          description: "RSS Feed Generated From My Personal Calendar",
          link: url.origin,
          item: allEvents.map(createRssItem),
        },
      },
    };

    const rss = create({ version: "1.0", encoding: "UTF-8" }, rssObject);
    const xmlRss = rss.end({ prettyPrint: true });

    return new Response(xmlRss, {
      status: 200,
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });
  } catch (error) {
    return new Response("Error Fetching Calendar", { status: 500 });
  }
};
