import express from 'express';

import ImageRouter from '@/routes/image';
import TemplateRouter from '@/routes/template';
import PdfRouter from '@/routes/pdf';

const app: express.Express = express();

app.use(express.json({ type: 'application/json', limit: '1mb' }));
app.use(express.text({ type: 'text/html', limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/v1/image', ImageRouter);
app.use('/v1/template', TemplateRouter);
app.use('/v1/pdf', PdfRouter);

export { app };
