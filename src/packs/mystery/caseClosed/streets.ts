// A sketch of the city centre under the crawl map (from the case-closed mockup): the main roads from Oxford Road up
// to the Northern Quarter, a park and the areas' names, as coordinates projected with the stops. Stops anywhere else
// still get their pins and yarn, on plain paper.
import type { Place } from './crawl';

type Line = Array<[number, number]>;

export const ROADS: Line[] = [
  [[53.456, -2.2265], [53.4629, -2.2305], [53.47, -2.2362], [53.4741, -2.241], [53.4778, -2.2433], [53.4815, -2.2452]],
  [[53.4769, -2.2412], [53.479, -2.2385], [53.4806, -2.2362]],
  [[53.4812, -2.2402], [53.4802, -2.233], [53.4795, -2.226]],
  [[53.4806, -2.2362], [53.4833, -2.2348], [53.488, -2.23]],
  [[53.479, -2.2315], [53.4816, -2.2341], [53.484, -2.2383]],
  [[53.47, -2.2362], [53.4718, -2.229], [53.4735, -2.223]],
  [[53.4741, -2.241], [53.476, -2.234], [53.477, -2.229]],
  [[53.47, -2.247], [53.4741, -2.241]],
];

export const PARK: Place = { lat: 53.481, lng: -2.2368 };

export const AREAS: Array<{ name: string } & Place> = [
  { name: 'Northern Quarter', lat: 53.484, lng: -2.2285 },
  { name: 'Piccadilly', lat: 53.479, lng: -2.242 },
  { name: 'Oxford Road', lat: 53.4668, lng: -2.24 },
  { name: 'University', lat: 53.4615, lng: -2.242 },
];
