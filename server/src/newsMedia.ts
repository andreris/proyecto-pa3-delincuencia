export const newsMedia = {
  rpp: {name: 'RPP Noticias', url: 'https://rpp.pe/rss'},
  elcomercio: {name: 'El Comercio', url: 'https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml'},
  infobae: {name: 'Infobae Perú', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/peru/?outputType=xml'},
  andina: {name: 'Agencia Andina', url: 'https://andina.pe/agencia/rss/noticias.aspx'},
  gestion: {name: 'Gestión', url: 'https://gestion.pe/arc/outboundfeeds/rss/?outputType=xml'},
  correo: {name: 'Diario Correo', url: 'https://diariocorreo.pe/arc/outboundfeeds/rss/?outputType=xml'},
  trome: {name: 'Trome', url: 'https://trome.com/arc/outboundfeeds/rss/?outputType=xml'},
  // Public Google News RSS search feed. It indexes headlines and links; it is not HTML scraping.
  google: {
    name: 'Google Noticias — Perú',
    url: 'https://news.google.com/rss/search?q=(robo+OR+asalto+OR+homicidio+OR+extorsion+OR+balacera+OR+secuestro)+Peru&hl=es-419&gl=PE&ceid=PE:es-419'
  }
} as const;

export type NewsMediaId = keyof typeof newsMedia;
export function isNewsMediaId(value: unknown): value is NewsMediaId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(newsMedia, value);
}
