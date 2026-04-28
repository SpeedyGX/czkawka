#![allow(dead_code)]

use std::path::PathBuf;

use num_enum::TryFromPrimitive;
use slint::{ComponentHandle, Model, ModelRc, SharedString, VecModel};

use crate::{ActiveTab, ExcludedPathsModel, IncludedPathsModel, MainWindow, Settings};
// Int model is used to store data in unchanged(* except that we need to split u64 into two i32) form and is used to sort/select data
// Str model is used to display data in gui

// Duplicates
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataDuplicateFiles {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    InodePart1,
    InodePart2,
}
pub const MAX_INT_DATA_DUPLICATE_FILES: usize = IntDataDuplicateFiles::InodePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataDuplicateFiles {
    Size,
    Name,
    Path,
    ModificationDate,
    Inode,
}
pub const MAX_STR_DATA_DUPLICATE_FILES: usize = StrDataDuplicateFiles::Inode as usize + 1;

// Empty Folders
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataEmptyFolders {
    ModificationDatePart1,
    ModificationDatePart2,
}
pub const MAX_INT_DATA_EMPTY_FOLDERS: usize = IntDataEmptyFolders::ModificationDatePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataEmptyFolders {
    Name,
    Path,
    ModificationDate,
}
pub const MAX_STR_DATA_EMPTY_FOLDERS: usize = StrDataEmptyFolders::ModificationDate as usize + 1;
// Big Files
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataBigFiles {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_BIG_FILES: usize = IntDataBigFiles::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataBigFiles {
    Size,
    Name,
    Path,
    ModificationDate,
}
pub const MAX_STR_DATA_BIG_FILES: usize = StrDataBigFiles::ModificationDate as usize + 1;

// Empty files
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataEmptyFiles {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_EMPTY_FILES: usize = IntDataEmptyFiles::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataEmptyFiles {
    Name,
    Path,
    ModificationDate,
}
pub const MAX_STR_DATA_EMPTY_FILES: usize = StrDataEmptyFiles::ModificationDate as usize + 1;
// Temporary Files
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataTemporaryFiles {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_TEMPORARY_FILES: usize = IntDataTemporaryFiles::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataTemporaryFiles {
    Name,
    Path,
    ModificationDate,
}
pub const MAX_STR_DATA_TEMPORARY_FILES: usize = StrDataTemporaryFiles::ModificationDate as usize + 1;

// Similar Images
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataSimilarImages {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    Width,
    Height,
    PixelCount,
    SimilarityValue,
    InodePart1,
    InodePart2,
}
pub const MAX_INT_DATA_SIMILAR_IMAGES: usize = IntDataSimilarImages::InodePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataSimilarImages {
    Similarity,
    Size,
    Resolution,
    Name,
    Path,
    ModificationDate,
    Inode,
}
pub const MAX_STR_DATA_SIMILAR_IMAGES: usize = StrDataSimilarImages::Inode as usize + 1;

// Similar Videos
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataSimilarVideos {
    SimilarityValue,
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    BitratePart1,
    BitratePart2,
    Duration,
    Fps,
    Dimensions,
    InodePart1,
    InodePart2,
}
pub const MAX_INT_DATA_SIMILAR_VIDEOS: usize = IntDataSimilarVideos::InodePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataSimilarVideos {
    Similarity,
    Size,
    Name,
    Path,
    Dimensions,
    Duration,
    Bitrate,
    Fps,
    Codec,
    ModificationDate,
    PreviewPath,
    Inode,
}
pub const MAX_STR_DATA_SIMILAR_VIDEOS: usize = StrDataSimilarVideos::Inode as usize + 1;

// Similar Music
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataSimilarMusic {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    Bitrate,
    Length,
}
pub const MAX_INT_DATA_SIMILAR_MUSIC: usize = IntDataSimilarMusic::Length as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataSimilarMusic {
    Size,
    Name,
    Title,
    Artist,
    Year,
    Bitrate,
    Length,
    Genre,
    Path,
    ModificationDate,
}
pub const MAX_STR_DATA_SIMILAR_MUSIC: usize = StrDataSimilarMusic::ModificationDate as usize + 1;

// Invalid Symlinks
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataInvalidSymlinks {
    ModificationDatePart1,
    ModificationDatePart2,
}
pub const MAX_INT_DATA_INVALID_SYMLINKS: usize = IntDataInvalidSymlinks::ModificationDatePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataInvalidSymlinks {
    SymlinkName,
    SymlinkFolder,
    DestinationPath,
    TypeOfError,
    ModificationDate,
}
pub const MAX_STR_DATA_INVALID_SYMLINKS: usize = StrDataInvalidSymlinks::ModificationDate as usize + 1;

// Broken Files
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataBrokenFiles {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_BROKEN_FILES: usize = IntDataBrokenFiles::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataBrokenFiles {
    Name,
    Path,
    TypeOfError,
    Size,
    ModificationDate,
}
pub const MAX_STR_DATA_BROKEN_FILES: usize = StrDataBrokenFiles::ModificationDate as usize + 1;
// Bad Extensions
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataBadExtensions {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_BAD_EXTENSIONS: usize = IntDataBadExtensions::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataBadExtensions {
    Name,
    Path,
    CurrentExtension,
    ProperExtensionsGroup,
    ProperExtension,
}
pub const MAX_STR_DATA_BAD_EXTENSIONS: usize = StrDataBadExtensions::ProperExtension as usize + 1;

// Bad Names
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataBadNames {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
}
pub const MAX_INT_DATA_BAD_NAMES: usize = IntDataBadNames::SizePart2 as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataBadNames {
    Name,
    NewName,
    Path,
}
pub const MAX_STR_DATA_BAD_NAMES: usize = StrDataBadNames::Path as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
// Exif Remover
pub enum IntDataExifRemover {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    ExifTagsCount,
}
pub const MAX_INT_DATA_EXIF_REMOVER: usize = IntDataExifRemover::ExifTagsCount as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataExifRemover {
    Size,
    Name,
    Path,
    ExifTags,
    ModificationDate,
    ExifGroupsNames,
    ExifTagsU16,
}
pub const MAX_STR_DATA_EXIF_REMOVER: usize = StrDataExifRemover::ExifTagsU16 as usize + 1;

// Video Optimizer
#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum IntDataVideoOptimizer {
    ModificationDatePart1,
    ModificationDatePart2,
    SizePart1,
    SizePart2,
    PixelCount,
    DiffInPixels,
    Width,
    Height,
    RectLeft,
    RectTop,
    RectRight,
    RectBottom,
}
pub const MAX_INT_DATA_VIDEO_OPTIMIZER: usize = IntDataVideoOptimizer::RectBottom as usize + 1;

#[repr(u8)]
#[derive(Debug, Eq, PartialEq, TryFromPrimitive)]
pub enum StrDataVideoOptimizer {
    Size,
    Name,
    Path,
    Codec,
    Dimensions,
    NewDimensions,
    ModificationDate,
    PreviewPath,
}
pub const MAX_STR_DATA_VIDEO_OPTIMIZER: usize = StrDataVideoOptimizer::PreviewPath as usize + 1;

pub(crate) enum SortIdx {
    StrIdx(i32),
    IntIdx(i32),
    IntIdxPair(i32, i32),
    Selection,
}

impl ActiveTab {
    pub(crate) fn get_str_int_sort_idx(self, str_idx: i32) -> SortIdx {
        // This not exists in enums, because selection is stored in other field
        if str_idx == 0 {
            return SortIdx::Selection;
        }
        let str_idx = str_idx - 1; // Adjust for selection

        match self {
            Self::EmptyFolders => match StrDataEmptyFolders::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for EmptyFolders")) {
                StrDataEmptyFolders::Name | StrDataEmptyFolders::Path => SortIdx::StrIdx(str_idx),
                StrDataEmptyFolders::ModificationDate => SortIdx::IntIdxPair(IntDataEmptyFolders::ModificationDatePart1 as i32, IntDataEmptyFolders::ModificationDatePart2 as i32),
            },
            Self::EmptyFiles => match StrDataEmptyFiles::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for EmptyFiles")) {
                StrDataEmptyFiles::Name | StrDataEmptyFiles::Path => SortIdx::StrIdx(str_idx),
                StrDataEmptyFiles::ModificationDate => SortIdx::IntIdxPair(IntDataEmptyFiles::ModificationDatePart1 as i32, IntDataEmptyFiles::ModificationDatePart2 as i32),
            },
            Self::SimilarImages => match StrDataSimilarImages::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for SimilarImages")) {
                StrDataSimilarImages::Similarity | StrDataSimilarImages::Name | StrDataSimilarImages::Path | StrDataSimilarImages::Inode => SortIdx::StrIdx(str_idx),
                StrDataSimilarImages::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataSimilarImages::ModificationDatePart1 as i32, IntDataSimilarImages::ModificationDatePart2 as i32)
                }
                StrDataSimilarImages::Size => SortIdx::IntIdxPair(IntDataSimilarImages::SizePart1 as i32, IntDataSimilarImages::SizePart2 as i32),
                StrDataSimilarImages::Resolution => SortIdx::IntIdx(IntDataSimilarImages::PixelCount as i32),
            },
            Self::DuplicateFiles => match StrDataDuplicateFiles::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for DuplicateFiles")) {
                StrDataDuplicateFiles::Name | StrDataDuplicateFiles::Path | StrDataDuplicateFiles::Inode => SortIdx::StrIdx(str_idx),
                StrDataDuplicateFiles::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataDuplicateFiles::ModificationDatePart1 as i32, IntDataDuplicateFiles::ModificationDatePart2 as i32)
                }
                StrDataDuplicateFiles::Size => SortIdx::IntIdxPair(IntDataDuplicateFiles::SizePart1 as i32, IntDataDuplicateFiles::SizePart2 as i32),
            },
            Self::BigFiles => match StrDataBigFiles::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for BigFiles")) {
                StrDataBigFiles::Name | StrDataBigFiles::Path => SortIdx::StrIdx(str_idx),
                StrDataBigFiles::ModificationDate => SortIdx::IntIdxPair(IntDataBigFiles::ModificationDatePart1 as i32, IntDataBigFiles::ModificationDatePart2 as i32),
                StrDataBigFiles::Size => SortIdx::IntIdxPair(IntDataBigFiles::SizePart1 as i32, IntDataBigFiles::SizePart2 as i32),
            },
            Self::TemporaryFiles => match StrDataTemporaryFiles::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for TemporaryFiles")) {
                StrDataTemporaryFiles::Name | StrDataTemporaryFiles::Path => SortIdx::StrIdx(str_idx),
                StrDataTemporaryFiles::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataTemporaryFiles::ModificationDatePart1 as i32, IntDataTemporaryFiles::ModificationDatePart2 as i32)
                }
            },
            Self::SimilarVideos => match StrDataSimilarVideos::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for SimilarVideos")) {
                StrDataSimilarVideos::Similarity | StrDataSimilarVideos::Name | StrDataSimilarVideos::Path | StrDataSimilarVideos::Codec | StrDataSimilarVideos::PreviewPath | StrDataSimilarVideos::Inode => SortIdx::StrIdx(str_idx),
                StrDataSimilarVideos::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataSimilarVideos::ModificationDatePart1 as i32, IntDataSimilarVideos::ModificationDatePart2 as i32)
                }
                StrDataSimilarVideos::Size => SortIdx::IntIdxPair(IntDataSimilarVideos::SizePart1 as i32, IntDataSimilarVideos::SizePart2 as i32),
                StrDataSimilarVideos::Bitrate => SortIdx::IntIdxPair(IntDataSimilarVideos::BitratePart1 as i32, IntDataSimilarVideos::BitratePart2 as i32),
                StrDataSimilarVideos::Duration => SortIdx::IntIdx(IntDataSimilarVideos::Duration as i32),
                StrDataSimilarVideos::Fps => SortIdx::IntIdx(IntDataSimilarVideos::Fps as i32),
                StrDataSimilarVideos::Dimensions => SortIdx::IntIdx(IntDataSimilarVideos::Dimensions as i32),
            },
            Self::SimilarMusic => match StrDataSimilarMusic::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for SimilarMusic")) {
                StrDataSimilarMusic::Name
                | StrDataSimilarMusic::Path
                | StrDataSimilarMusic::Title
                | StrDataSimilarMusic::Artist
                | StrDataSimilarMusic::Year
                | StrDataSimilarMusic::Bitrate
                | StrDataSimilarMusic::Length
                | StrDataSimilarMusic::Genre => SortIdx::StrIdx(str_idx),
                StrDataSimilarMusic::ModificationDate => SortIdx::IntIdxPair(IntDataSimilarMusic::ModificationDatePart1 as i32, IntDataSimilarMusic::ModificationDatePart2 as i32),
                StrDataSimilarMusic::Size => SortIdx::IntIdxPair(IntDataSimilarMusic::SizePart1 as i32, IntDataSimilarMusic::SizePart2 as i32),
            },
            Self::InvalidSymlinks => match StrDataInvalidSymlinks::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for InvalidSymlinks")) {
                StrDataInvalidSymlinks::SymlinkName | StrDataInvalidSymlinks::SymlinkFolder | StrDataInvalidSymlinks::DestinationPath | StrDataInvalidSymlinks::TypeOfError => {
                    SortIdx::StrIdx(str_idx)
                }
                StrDataInvalidSymlinks::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataInvalidSymlinks::ModificationDatePart1 as i32, IntDataInvalidSymlinks::ModificationDatePart2 as i32)
                }
            },
            Self::BrokenFiles => match StrDataBrokenFiles::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for BrokenFiles")) {
                StrDataBrokenFiles::Name | StrDataBrokenFiles::Path | StrDataBrokenFiles::TypeOfError => SortIdx::StrIdx(str_idx),
                StrDataBrokenFiles::ModificationDate => SortIdx::IntIdxPair(IntDataBrokenFiles::ModificationDatePart1 as i32, IntDataBrokenFiles::ModificationDatePart2 as i32),
                StrDataBrokenFiles::Size => SortIdx::IntIdxPair(IntDataBrokenFiles::SizePart1 as i32, IntDataBrokenFiles::SizePart2 as i32),
            },
            Self::BadExtensions => match StrDataBadExtensions::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for BadExtensions")) {
                StrDataBadExtensions::Name
                | StrDataBadExtensions::Path
                | StrDataBadExtensions::CurrentExtension
                | StrDataBadExtensions::ProperExtensionsGroup
                | StrDataBadExtensions::ProperExtension => SortIdx::StrIdx(str_idx),
            },
            Self::BadNames => match StrDataBadNames::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for BadNames")) {
                StrDataBadNames::Name | StrDataBadNames::Path | StrDataBadNames::NewName => SortIdx::StrIdx(str_idx),
            },
            Self::ExifRemover => match StrDataExifRemover::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for ExifRemover")) {
                StrDataExifRemover::ExifTagsU16 | StrDataExifRemover::ExifGroupsNames | StrDataExifRemover::Name | StrDataExifRemover::Path => SortIdx::StrIdx(str_idx),
                StrDataExifRemover::ModificationDate => SortIdx::IntIdxPair(IntDataExifRemover::ModificationDatePart1 as i32, IntDataExifRemover::ModificationDatePart2 as i32),
                StrDataExifRemover::ExifTags => SortIdx::IntIdx(IntDataExifRemover::ExifTagsCount as i32),
                StrDataExifRemover::Size => SortIdx::IntIdxPair(IntDataExifRemover::SizePart1 as i32, IntDataExifRemover::SizePart2 as i32),
            },
            Self::VideoOptimizer => match StrDataVideoOptimizer::try_from(str_idx as u8).unwrap_or_else(|_| panic!("Invalid str idx {str_idx} for VideoOptimizer")) {
                StrDataVideoOptimizer::Name | StrDataVideoOptimizer::Path | StrDataVideoOptimizer::Codec | StrDataVideoOptimizer::PreviewPath => SortIdx::StrIdx(str_idx),
                StrDataVideoOptimizer::ModificationDate => {
                    SortIdx::IntIdxPair(IntDataVideoOptimizer::ModificationDatePart1 as i32, IntDataVideoOptimizer::ModificationDatePart2 as i32)
                }
                StrDataVideoOptimizer::Size => SortIdx::IntIdxPair(IntDataVideoOptimizer::SizePart1 as i32, IntDataVideoOptimizer::SizePart2 as i32),
                StrDataVideoOptimizer::Dimensions => SortIdx::IntIdx(IntDataVideoOptimizer::PixelCount as i32),
                StrDataVideoOptimizer::NewDimensions => SortIdx::IntIdx(IntDataVideoOptimizer::DiffInPixels as i32),
            },
            Self::Settings | Self::About => panic!("Button should be disabled"),
        }
    }


    pub(crate) fn get_str_proper_extension(self) -> usize {
        match self {
            Self::BadExtensions => StrDataBadExtensions::ProperExtension as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get proper extension from this tab"),
        }
    }
    pub(crate) fn get_int_width_idx(self) -> usize {
        match self {
            Self::SimilarImages => IntDataSimilarImages::Width as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get height from this tab"),
        }
    }

    pub(crate) fn get_int_height_idx(self) -> usize {
        match self {
            Self::SimilarImages => IntDataSimilarImages::Height as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get height from this tab"),
        }
    }

    pub(crate) fn get_int_pixel_count_idx(self) -> usize {
        match self {
            Self::SimilarImages => IntDataSimilarImages::PixelCount as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get total pixel count from this tab"),
        }
    }

    pub(crate) fn get_str_video_codec_idx(self) -> usize {
        match self {
            Self::SimilarVideos => StrDataSimilarVideos::Codec as usize,
            Self::VideoOptimizer => StrDataVideoOptimizer::Codec as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get video codec from this tab"),
        }
    }

    pub(crate) fn get_exif_tag_names_idx(self) -> usize {
        match self {
            Self::ExifRemover => StrDataExifRemover::ExifTags as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get exif tag names from this tab"),
        }
    }

    pub(crate) fn get_exif_tag_groups_idx(self) -> usize {
        match self {
            Self::ExifRemover => StrDataExifRemover::ExifGroupsNames as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get exif tag groups from this tab"),
        }
    }

    pub(crate) fn get_exif_tag_u16_idx(self) -> usize {
        match self {
            Self::ExifRemover => StrDataExifRemover::ExifTagsU16 as usize,
            Self::Settings | Self::About => panic!("Button should be disabled"),
            _ => panic!("Unable to get exif tag u16 from this tab"),
        }
    }

}

pub(crate) fn create_included_paths_model_from_pathbuf(items: &[PathBuf], referenced: &[PathBuf]) -> ModelRc<IncludedPathsModel> {
    let referenced_as_string = referenced.iter().map(|x| x.to_string_lossy().to_string()).collect::<Vec<_>>();
    let converted = items
        .iter()
        .map(|x| {
            let path_as_string = x.to_string_lossy().to_string();
            IncludedPathsModel {
                path: x.to_string_lossy().to_string().into(),
                referenced_path: referenced_as_string.contains(&path_as_string),
                selected_row: false,
            }
        })
        .collect::<Vec<_>>();
    ModelRc::new(VecModel::from(converted))
}

pub(crate) fn create_excluded_paths_model_from_pathbuf(items: &[PathBuf]) -> ModelRc<ExcludedPathsModel> {
    let converted = items
        .iter()
        .map(|x| ExcludedPathsModel {
            path: x.to_string_lossy().to_string().into(),
            selected_row: false,
        })
        .collect::<Vec<_>>();
    ModelRc::new(VecModel::from(converted))
}

pub(crate) fn check_if_there_are_any_included_folders(app: &MainWindow) -> bool {
    let included = app.global::<Settings>().get_included_paths_model();
    included.iter().count() > 0
}

pub(crate) fn check_if_all_included_dirs_are_referenced(app: &MainWindow) -> bool {
    let included = app.global::<Settings>().get_included_paths_model();
    included.iter().all(|x| x.referenced_path)
}

pub(crate) fn create_vec_model_from_vec_string(items: Vec<String>) -> VecModel<SharedString> {
    VecModel::from(items.into_iter().map(SharedString::from).collect::<Vec<_>>())
}

// Workaround for https://github.com/slint-ui/slint/discussions/4596
// Currently there is no way to save u64 in slint, so we need to split it into two i32
pub(crate) fn split_u64_into_i32s(value: u64) -> (i32, i32) {
    let part1: i32 = (value >> 32) as i32;
    let part2: i32 = value as i32;
    (part1, part2)
}

pub(crate) fn connect_i32_into_u64(part1: i32, part2: i32) -> u64 {
    ((part1 as u64) << 32) | (part2 as u64 & 0xFFFF_FFFF)
}

pub(crate) fn create_model_from_model_vec<T: Clone + 'static>(model_vec: &[T]) -> ModelRc<T> {
    ModelRc::new(VecModel::from(model_vec.to_owned()))
}

#[cfg(test)]
mod test {
    use crate::common::split_u64_into_i32s;

    #[test]
    fn test_split_u64_into_i32s_small() {
        let value = 1;
        let (part1, part2) = split_u64_into_i32s(value);
        assert_eq!(part1, 0);
        assert_eq!(part2, 1);
    }

    #[test]
    fn test_split_u64_into_i32s_big() {
        let value = u64::MAX;
        let (part1, part2) = split_u64_into_i32s(value);
        assert_eq!(part1, -1);
        assert_eq!(part2, -1);
    }

    #[test]
    fn test_connect_i32_into_u64_small() {
        let part1 = 0;
        let part2 = 1;
        let value = super::connect_i32_into_u64(part1, part2);
        assert_eq!(value, 1);
    }

    #[test]
    fn test_connect_i32_into_u64_big() {
        let part1 = -1;
        let part2 = -1;
        let value = super::connect_i32_into_u64(part1, part2);
        assert_eq!(value, u64::MAX);
    }

    #[test]
    fn test_connect_split_zero() {
        for start_value in [0, 1, 10, u32::MAX as u64, i32::MAX as u64, u64::MAX] {
            let (part1, part2) = split_u64_into_i32s(start_value);
            let end_value = super::connect_i32_into_u64(part1, part2);
            assert_eq!(start_value, end_value);
        }
    }
}
