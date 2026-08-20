package ro.emarqet.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

public class UpdateFileProvider extends ContentProvider {
    public static final String AUTHORITY = "ro.emarqet.app.updates";
    public static final String FILE_NAME = "emarqet-update.apk";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "application/vnd.android.package-archive";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file = updateFile();
        MatrixCursor cursor = new MatrixCursor(new String[] {
            OpenableColumns.DISPLAY_NAME,
            OpenableColumns.SIZE
        });
        cursor.addRow(new Object[] { FILE_NAME, file.exists() ? file.length() : 0 });
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = updateFile();
        if (!file.exists()) throw new FileNotFoundException(FILE_NAME);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }

    private File updateFile() {
        return new File(new File(getContext().getCacheDir(), "updates"), FILE_NAME);
    }
}
