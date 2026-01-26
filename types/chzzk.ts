export interface SearchResult {
    id: string;
    name: string;
    avatarUrl: string;
    channelUrl: string;
    description?: string;
    isVerified?: boolean;
}

export interface ChannelVideo {
    videoNo: number;
    videoId: string;
    videoTitle: string;
    videoType: string;
    publishDate: string;
    thumbnailImageUrl: string;
    duration: number;
    readCount: number;
    publishDateAt: number;
    videoCategoryValue: string;
    adult: boolean;
    channel: {
        channelId: string;
        channelName: string;
        channelImageUrl: string;
        verifiedMark: boolean;
    }
}

export interface ChannelVideoResponse {
    videos: ChannelVideo[];
    page: number;
    size: number;
    totalCount: number;
    totalPages: number;
}
