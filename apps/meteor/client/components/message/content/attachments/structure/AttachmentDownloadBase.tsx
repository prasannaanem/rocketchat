import { useTranslation } from '@rocket.chat/ui-contexts';
import type { ComponentProps, FC } from 'react';
import React from 'react';

import Action from '../../Action';

type AttachmentDownloadBaseProps = Omit<ComponentProps<typeof Action>, 'icon'> & { title?: string | undefined; href: string };

const AttachmentDownloadBase: FC<AttachmentDownloadBaseProps> = ({ title, href, ...props }) => {
	const t = useTranslation();

	return (
		<Action
			icon='cloud-arrow-down'
			href={`${href}?download`}
			title={t('Download')}
			is='a'
			target='_blank'
			rel='noopener noreferrer'
			download={title}
			{...props}
		/>
	);
};

export default AttachmentDownloadBase;
