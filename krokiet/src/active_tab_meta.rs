//! Per-tab metadata lookup tables.
//!
//! These replace the repetitive 14-arm `match` blocks that previously appeared
//! in `impl ActiveTab`.  Adding a new tool now requires only touching the two
//! arrays below and the getter functions that follow.

use slint::ModelRc;

use crate::common::{
    IntDataBadExtensions, IntDataBadNames, IntDataBigFiles, IntDataBrokenFiles, IntDataDuplicateFiles, IntDataEmptyFiles, IntDataEmptyFolders, IntDataExifRemover,
    IntDataInvalidSymlinks, IntDataSimilarImages, IntDataSimilarMusic, IntDataSimilarVideos, IntDataTemporaryFiles, IntDataVideoOptimizer, StrDataBadExtensions,
    StrDataBadNames, StrDataBigFiles, StrDataBrokenFiles, StrDataDuplicateFiles, StrDataEmptyFiles, StrDataEmptyFolders, StrDataExifRemover, StrDataInvalidSymlinks,
    StrDataSimilarImages, StrDataSimilarMusic, StrDataSimilarVideos, StrDataTemporaryFiles, StrDataVideoOptimizer,
};
use crate::{ActiveTab, MainWindow, SingleMainListModel};

// ---------------------------------------------------------------------------
// Per-tab metadata: (str_path_idx, str_name_idx, int_date_idx, int_size_opt, header_mode)
//
// The order MUST match the ActiveTab enum variant order (see common.slint).
// Fields that don't apply use usize::MAX / None / false sentinels.
// ---------------------------------------------------------------------------

type TabMeta = (usize, usize, usize, Option<usize>, bool);

const TAB_META: &[TabMeta] = &[
    // DuplicateFiles
    (StrDataDuplicateFiles::Path as usize, StrDataDuplicateFiles::Name as usize, IntDataDuplicateFiles::ModificationDatePart1 as usize, Some(IntDataDuplicateFiles::SizePart1 as usize), true),
    // EmptyFolders
    (StrDataEmptyFolders::Path as usize, StrDataEmptyFolders::Name as usize, IntDataEmptyFolders::ModificationDatePart1 as usize, None, false),
    // BigFiles
    (StrDataBigFiles::Path as usize, StrDataBigFiles::Name as usize, IntDataBigFiles::ModificationDatePart1 as usize, Some(IntDataBigFiles::SizePart1 as usize), false),
    // EmptyFiles
    (StrDataEmptyFiles::Path as usize, StrDataEmptyFiles::Name as usize, IntDataEmptyFiles::ModificationDatePart1 as usize, Some(IntDataEmptyFiles::SizePart1 as usize), false),
    // TemporaryFiles
    (StrDataTemporaryFiles::Path as usize, StrDataTemporaryFiles::Name as usize, IntDataTemporaryFiles::ModificationDatePart1 as usize, Some(IntDataTemporaryFiles::SizePart1 as usize), false),
    // SimilarImages
    (StrDataSimilarImages::Path as usize, StrDataSimilarImages::Name as usize, IntDataSimilarImages::ModificationDatePart1 as usize, Some(IntDataSimilarImages::SizePart1 as usize), true),
    // SimilarVideos
    (StrDataSimilarVideos::Path as usize, StrDataSimilarVideos::Name as usize, IntDataSimilarVideos::ModificationDatePart1 as usize, Some(IntDataSimilarVideos::SizePart1 as usize), true),
    // SimilarMusic
    (StrDataSimilarMusic::Path as usize, StrDataSimilarMusic::Name as usize, IntDataSimilarMusic::ModificationDatePart1 as usize, Some(IntDataSimilarMusic::SizePart1 as usize), true),
    // InvalidSymlinks
    (StrDataInvalidSymlinks::SymlinkFolder as usize, StrDataInvalidSymlinks::SymlinkName as usize, IntDataInvalidSymlinks::ModificationDatePart1 as usize, None, false),
    // BrokenFiles
    (StrDataBrokenFiles::Path as usize, StrDataBrokenFiles::Name as usize, IntDataBrokenFiles::ModificationDatePart1 as usize, Some(IntDataBrokenFiles::SizePart1 as usize), false),
    // BadExtensions
    (StrDataBadExtensions::Path as usize, StrDataBadExtensions::Name as usize, IntDataBadExtensions::ModificationDatePart1 as usize, Some(IntDataBadExtensions::SizePart1 as usize), false),
    // BadNames
    (StrDataBadNames::Path as usize, StrDataBadNames::Name as usize, IntDataBadNames::ModificationDatePart1 as usize, Some(IntDataBadNames::SizePart1 as usize), false),
    // ExifRemover
    (StrDataExifRemover::Path as usize, StrDataExifRemover::Name as usize, IntDataExifRemover::ModificationDatePart1 as usize, Some(IntDataExifRemover::SizePart1 as usize), false),
    // VideoOptimizer
    (StrDataVideoOptimizer::Path as usize, StrDataVideoOptimizer::Name as usize, IntDataVideoOptimizer::ModificationDatePart1 as usize, Some(IntDataVideoOptimizer::SizePart1 as usize), false),
    // Settings, About — these are never dereferenced (callers panic before calling)
    (0, 0, 0, None, false),
    (0, 0, 0, None, false),
];

fn meta(tab: ActiveTab) -> &'static TabMeta {
    &TAB_META[tab as usize]
}

impl ActiveTab {
    pub(crate) fn get_str_path_idx(self) -> usize {
        meta(self).0
    }

    pub(crate) fn get_str_name_idx(self) -> usize {
        meta(self).1
    }

    pub(crate) fn get_int_modification_date_idx(self) -> usize {
        meta(self).2
    }

    pub(crate) fn get_int_size_opt_idx(self) -> Option<usize> {
        meta(self).3
    }

    pub(crate) fn get_int_size_idx(self) -> usize {
        self.get_int_size_opt_idx()
            .unwrap_or_else(|| panic!("Unable to get size index for tab: {self:?}"))
    }

    pub(crate) fn get_is_header_mode(self) -> bool {
        meta(self).4
    }

    pub(crate) fn get_tool_model(self, app: &MainWindow) -> ModelRc<SingleMainListModel> {
        match self {
            Self::DuplicateFiles => app.get_duplicate_files_model(),
            Self::EmptyFolders => app.get_empty_folder_model(),
            Self::BigFiles => app.get_big_files_model(),
            Self::EmptyFiles => app.get_empty_files_model(),
            Self::TemporaryFiles => app.get_temporary_files_model(),
            Self::SimilarImages => app.get_similar_images_model(),
            Self::SimilarVideos => app.get_similar_videos_model(),
            Self::SimilarMusic => app.get_similar_music_model(),
            Self::InvalidSymlinks => app.get_invalid_symlinks_model(),
            Self::BrokenFiles => app.get_broken_files_model(),
            Self::BadExtensions => app.get_bad_extensions_model(),
            Self::BadNames => app.get_bad_names_model(),
            Self::ExifRemover => app.get_exif_remover_model(),
            Self::VideoOptimizer => app.get_video_optimizer_model(),
            Self::Settings | Self::About => panic!("Cannot get tool model for settings or about tab"),
        }
    }

    pub(crate) fn set_tool_model(self, app: &MainWindow, model: ModelRc<SingleMainListModel>) {
        match self {
            Self::DuplicateFiles => app.set_duplicate_files_model(model),
            Self::EmptyFolders => app.set_empty_folder_model(model),
            Self::BigFiles => app.set_big_files_model(model),
            Self::EmptyFiles => app.set_empty_files_model(model),
            Self::TemporaryFiles => app.set_temporary_files_model(model),
            Self::SimilarImages => app.set_similar_images_model(model),
            Self::SimilarVideos => app.set_similar_videos_model(model),
            Self::SimilarMusic => app.set_similar_music_model(model),
            Self::InvalidSymlinks => app.set_invalid_symlinks_model(model),
            Self::BrokenFiles => app.set_broken_files_model(model),
            Self::BadExtensions => app.set_bad_extensions_model(model),
            Self::BadNames => app.set_bad_names_model(model),
            Self::ExifRemover => app.set_exif_remover_model(model),
            Self::VideoOptimizer => app.set_video_optimizer_model(model),
            Self::Settings | Self::About => panic!("Cannot set tool model for settings or about tab"),
        }
    }
}
