import { Image, Printer, type LucideIcon } from 'lucide-react';
import type { ExportFormatId } from '../state/exportFlow';

/** The icon for each export format. */
export const FORMAT_ICON: Record<ExportFormatId, LucideIcon> = {
  svg: Image,
  stl: Printer,
  'stl-two-files': Printer,
};
