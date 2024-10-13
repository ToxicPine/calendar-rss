import ICAL from "ical.js";
import { create } from "xmlbuilder";
import { createClient } from "@supabase/supabase-js";

const API_KEY = process.env.API_KEY!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CACHE_TTL = 2 * 60 * 60 * 1000;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkSupabaseCache(): Promise<string | null> {
  const { data, error } = await supabase
    .from("rss_cache")
    .select("rss_data, timestamp")
    .eq("id", 1)
    .single();

  if (error) {
    console.error("Error fetching cache from Supabase:", error);
    return null;
  }

  if (data && Date.now() - new Date(data.timestamp).getTime() < CACHE_TTL) {
    return data.rss_data;
  }

  return null;
}

async function updateSupabaseCache(newData: string): Promise<void> {
  const { error } = await supabase.from("rss_cache").upsert({
    id: 1,
    rss_data: newData,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    console.error("Error updating cache in Supabase:", error);
  }
}

export const config = {
  runtime: "edge",
};

function getEventUrl(vevent: ICAL.Component): string | null {
  const url = vevent.getFirstPropertyValue("X-GOOGLE-CALENDAR-CONTENT-URL");
  return typeof url === "string" ? url : null;
}

function addField<T, K extends keyof T>(
  target: T,
  _source: ICAL.Event,
  key: K,
  getValue: () => any,
) {
  const value = getValue();
  if (value != null) {
    target[key] = value;
  }
}

async function fetchCalendarEvents(icalUrl: string): Promise<ICAL.Event[]> {
  console.log("Fetching iCal URL:", icalUrl);
  const response = await fetch(icalUrl);
  const data = await response.text();
  console.log("Fetched iCal data:", data.substring(0, 100));
  const jcalData = ICAL.parse(data);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents("vevent");

  return vevents.map((vevent) => new ICAL.Event(vevent));
}

function createRssItem(event: ICAL.Event): any {
  const eventUrl = getEventUrl(event.component);
  const item: any = {
    title: event.summary,
    description: `
      <p>${event.description || "No description available"}</p>
      <p><strong>Start Date:</strong> ${event.startDate.toJSDate().toLocaleString()}</p>
      <p><strong>End Date:</strong> ${event.endDate ? event.endDate.toJSDate().toLocaleString() : "N/A"}</p>
      <p><strong>Location:</strong> ${event.location || "No location specified"}</p>
      <p><strong>Organizer:</strong> ${event.organizer?.toString() || "No organizer specified"}</p>
      ${
        event.attendees
          ? `<p><strong>Attendees:</strong> ${event.attendees.map((attendee) => attendee.toString()).join(", ")}</p>`
          : ""
      }
    `,
    pubDate: event.startDate.toJSDate().toUTCString(),
    link: eventUrl || undefined,
  };

  /*
  addField(item, event, "link", () => eventUrl);
  addField(item, event, "location", () => event.location);
  addField(item, event, "organizer", () => event.organizer?.toString());
  addField(item, event, "attendees", () =>
    event.attendees?.map((attendee) => attendee.toString()),
  );
  */

  return item;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const apiKey = url.searchParams.get("api_key");

  if (apiKey !== API_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  let cachedRssData = await checkSupabaseCache();

  if (!cachedRssData) {
    const icalUrls = process.env.ICAL_URLS
      ? JSON.parse(process.env.ICAL_URLS)
      : [];
    console.log("ICAL URLs:", icalUrls);

    try {
      const events = await Promise.all(icalUrls.map(fetchCalendarEvents));
      const allEvents = events.flat();

      const now = new Date();
      const lookAheadDays = parseInt(process.env.LOOK_AHEAD_DAYS || "3", 10);
      const futureDate = new Date(now);
      futureDate.setDate(futureDate.getDate() + lookAheadDays);

      const futureEvents = allEvents.filter(
        (event) =>
          event.startDate.toJSDate() >= now &&
          event.startDate.toJSDate() <= futureDate,
      );

      console.log("Number of Future Events Fetched:", futureEvents.length);
      futureEvents.forEach((event) => console.log("Event:", event));

      const rssObject = {
        rss: {
          "@version": "2.0",
          channel: {
            title: "Personal Calendar",
            description: "RSS Feed Generated From My Personal Calendar",
            link: url.origin,
            item: futureEvents.map(createRssItem),
          },
        },
      };

      const rss = create(rssObject, { version: "1.0", encoding: "UTF-8" });
      cachedRssData = rss.end();

      await updateSupabaseCache(cachedRssData);
    } catch (error) {
      console.error("Error Fetching Calendar", error);
      return new Response("Error Fetching Calendar", { status: 500 });
    }
  }

  return new Response(cachedRssData, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=60",
    },
  });
};
