const encodeSegment = (segment: string) => {
  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
};

export const toFileUri = (path: string) => {
  let pathname: string;
  if (path.startsWith('file://')) {
    pathname = path.slice('file://'.length);
  } else if (path.startsWith('file:/')) {
    pathname = path.replace(/^file:\/*/, '/');
  } else if (path.startsWith('/')) {
    pathname = path;
  } else {
    return path;
  }
  return `file://${pathname.split('/').map(encodeSegment).join('/')}`;
};
