export default {
  seitentitel: (data) => {
    if (data.album) return data.album.title;
    if (data.foto) return data.foto.caption || data.foto.alt;
    return null;
  },
};
