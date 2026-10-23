let platformFeatures = {};

async function loadPlatformFeatures(portal) {
  try {
    const data = await fetch(`/api/platform/features/${portal}`).then((r) => r.json());
    platformFeatures = data.features || {};
  } catch {
    platformFeatures = {};
  }
  return platformFeatures;
}

function isFeatureOn(key) {
  return platformFeatures[key] !== false;
}
