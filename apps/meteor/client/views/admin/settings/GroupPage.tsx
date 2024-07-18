import type { ISetting, ISettingColor } from '@rocket.chat/core-typings';
import { Accordion, Box, Button, ButtonGroup } from '@rocket.chat/fuselage';
import { useMutableCallback } from '@rocket.chat/fuselage-hooks';
import type { TranslationKey } from '@rocket.chat/ui-contexts';
import { useToastMessageDispatch, useSettingsDispatch, useSettings, useTranslation, useRoute } from '@rocket.chat/ui-contexts';
import type { FC, ReactNode, FormEvent, MouseEvent } from 'react';
import React, { useMemo, memo } from 'react';

import { Page, PageHeader, PageScrollableContentWithShadow, PageFooter } from '../../../components/Page';
import type { EditableSetting } from '../EditableSettingsContext';
import { useEditableSettingsDispatch, useEditableSettings } from '../EditableSettingsContext';
import GroupPageSkeleton from './GroupPageSkeleton';

type GroupPageProps = {
	children: ReactNode;
	headerButtons?: ReactNode;
	_id: string;
	i18nLabel: string;
	i18nDescription?: string;
	tabs?: ReactNode;
	isCustom?: boolean;
};

const GroupPage: FC<GroupPageProps> = ({
	children = undefined,
	headerButtons = undefined,
	_id,
	i18nLabel,
	i18nDescription = undefined,
	tabs = undefined,
	isCustom = false,
}) => {
	const t = useTranslation();
	const router = useRoute('admin-settings');
	const dispatch = useSettingsDispatch();
	const dispatchToastMessage = useToastMessageDispatch();

	const changedEditableSettings = useEditableSettings(
		useMemo(
			() => ({
				group: _id,
				changed: true,
			}),
			[_id],
		),
	);

	const originalSettings = useSettings(
		useMemo(
			() => ({
				_id: changedEditableSettings.map(({ _id }) => _id),
			}),
			[changedEditableSettings],
		),
	);

	const isColorSetting = (setting: ISetting): setting is ISettingColor => setting.type === 'color';

	const save = useMutableCallback(async () => {
		const changes = changedEditableSettings.map((setting) => {
			if (isColorSetting(setting)) {
				return {
					_id: setting._id,
					value: setting.value,
					editor: setting.editor,
				};
			}

			return {
				_id: setting._id,
				value: setting.value,
			};
		});

		if (changes.length === 0) {
			return;
		}

		try {
			await dispatch(changes);
			dispatchToastMessage({ type: 'success', message: t('Settings_updated') });
		} catch (error) {
			dispatchToastMessage({ type: 'error', message: error });
		}
	});

	const dispatchToEditing = useEditableSettingsDispatch();

	const cancel = useMutableCallback(() => {
		const settingsToDispatch = changedEditableSettings
			.map(({ _id }) => originalSettings.find((setting) => setting._id === _id))
			.map((setting) => {
				if (!setting) {
					return;
				}

				if (isColorSetting(setting)) {
					return {
						_id: setting._id,
						value: setting.value,
						editor: setting.editor,
						changed: false,
					};
				}

				return {
					_id: setting._id,
					value: setting.value,
					changed: false,
				};
			})
			.filter(Boolean);
		dispatchToEditing(settingsToDispatch as Partial<EditableSetting>[]);
	});

	const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
		event.preventDefault();
		save();
	};

	const handleBack = useMutableCallback(() => router.push({}));

	const handleCancelClick = (event: MouseEvent<HTMLOrSVGElement>): void => {
		event.preventDefault();
		cancel();
	};

	const handleSaveClick = (event: MouseEvent<HTMLOrSVGElement>): void => {
		event.preventDefault();
		save();
	};

	if (!_id) {
		return <Page>{children}</Page>;
	}

	// The settings
	const isTranslationKey = (key: string): key is TranslationKey => (key as TranslationKey) !== undefined;

	return (
		<Page is='form' action='#' method='post' onSubmit={handleSubmit}>
			<PageHeader onClickBack={handleBack} title={i18nLabel && isTranslationKey(i18nLabel) && t(i18nLabel)}>
				<ButtonGroup>{headerButtons}</ButtonGroup>
			</PageHeader>
			{tabs}
			{isCustom ? (
				children
			) : (
				<PageScrollableContentWithShadow>
					<Box marginBlock='none' marginInline='auto' width='full' maxWidth='x580'>
						{i18nDescription && isTranslationKey(i18nDescription) && t.has(i18nDescription) && (
							<Box is='p' color='hint' fontScale='p2'>
								{t(i18nDescription)}
							</Box>
						)}

						<Accordion className='page-settings'>{children}</Accordion>
					</Box>
				</PageScrollableContentWithShadow>
			)}
			<PageFooter isDirty={!(changedEditableSettings.length === 0)}>
				<ButtonGroup>
					{changedEditableSettings.length > 0 && (
						<Button type='reset' onClick={handleCancelClick}>
							{t('Cancel')}
						</Button>
					)}
					<Button
						children={t('Save_changes')}
						className='save'
						disabled={changedEditableSettings.length === 0}
						primary
						type='submit'
						onClick={handleSaveClick}
					/>
				</ButtonGroup>
			</PageFooter>
		</Page>
	);
};

export default Object.assign(memo(GroupPage), {
	Skeleton: GroupPageSkeleton,
});
