import { REFERENCES } from "./history.js";

export default function Citations({ ids }) {
  return (
    <div className="night-citations" aria-label="本段依据">
      {ids.map((id) => (
        <a key={id} href={REFERENCES[id].url} target="_blank" rel="noreferrer">
          {REFERENCES[id].title} ↗
        </a>
      ))}
    </div>
  );
}
