package ro.emarqet.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.Context;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputType;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String BASE_URL = "https://e-marqet.com";
    private static final String UPDATE_URL = BASE_URL + "/mobile/emarqet/update.json";
    private static final String AUTH_ME_URL = BASE_URL + "/api/e-marqet/auth/me";
    private static final String AUTH_LOGIN_URL = BASE_URL + "/api/e-marqet/auth/login";
    private static final String AUTH_LOGOUT_URL = BASE_URL + "/api/e-marqet/auth/logout";
    private static final int REQUEST_UNKNOWN_APP_SOURCES = 4701;

    private final int blue = Color.rgb(15, 148, 210);
    private final int deepBlue = Color.rgb(7, 89, 133);
    private final int ink = Color.rgb(15, 23, 42);
    private final int muted = Color.rgb(71, 85, 105);
    private final int border = Color.rgb(186, 230, 253);
    private final int surface = Color.rgb(239, 249, 255);

    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private Handler handler;
    private LinearLayout root;
    private LinearLayout content;
    private LinearLayout listContainer;
    private LinearLayout autoFilterRow;
    private LinearLayout categoryStrip;
    private Button categoryToggleButton;
    private EditText searchInput;
    private Spinner verticalSpinner;
    private Spinner brandSpinner;
    private Spinner modelSpinner;
    private TextView statusText;

    private JSONObject brandModels = new JSONObject();
    private final ArrayList<Vertical> verticalOptions = new ArrayList<Vertical>();
    private final ArrayList<String> brandOptions = new ArrayList<String>();
    private final ArrayList<String> modelOptions = new ArrayList<String>();
    private final ArrayList<Listing> listings = new ArrayList<Listing>();
    private String selectedVertical = "";
    private String selectedBrand = "";
    private String selectedModel = "";
    private Listing selectedListing;
    private int selectedImageIndex = 0;
    private String pendingUpdateUrl = "";
    private String sessionCookie = "";
    private String currentUserName = "";
    private String currentUserEmail = "";
    private int autoUpdateStartedVersionCode = 0;
    private boolean categoriesVisible = false;

    @Override
    protected void onCreate(Bundle bundle) {
        super.onCreate(bundle);
        handler = new Handler(Looper.getMainLooper());
        getWindow().setStatusBarColor(deepBlue);
        getWindow().setNavigationBarColor(deepBlue);
        sessionCookie = prefs().getString("session_cookie", "");
        currentUserName = prefs().getString("user_name", "");
        currentUserEmail = prefs().getString("user_email", "");
        renderHome();
        loadConfig();
        loadListings();
        checkCurrentUser(false);
        checkForUpdates(false);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (pendingUpdateUrl.length() > 0 && (Build.VERSION.SDK_INT < 26 || getPackageManager().canRequestPackageInstalls())) {
            String apkUrl = pendingUpdateUrl;
            pendingUpdateUrl = "";
            downloadAndInstallUpdate(apkUrl);
        }
    }

    private void renderHome() {
        selectedListing = null;
        selectedImageIndex = 0;
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(surface);
        setContentView(root);

        root.addView(topBar("e-Marqet", "Anunturi si servicii"));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(14), dp(14), dp(14), dp(18));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));

        buildFilters();

        statusText = text("Se incarca anunturile...", 14, muted, Typeface.NORMAL);
        setMargins(statusText, 0, dp(8), 0, dp(8));
        content.addView(statusText);

        listContainer = new LinearLayout(this);
        listContainer.setOrientation(LinearLayout.VERTICAL);
        content.addView(listContainer, new LinearLayout.LayoutParams(-1, -2));
    }

    private void buildFilters() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(dp(12), dp(12), dp(12), dp(12));
        panel.setBackground(cardBg(Color.WHITE));
        content.addView(panel, new LinearLayout.LayoutParams(-1, -2));

        searchInput = new EditText(this);
        searchInput.setSingleLine(true);
        searchInput.setHint("Cauta anunt, oras, marca sau serviciu");
        searchInput.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        searchInput.setInputType(InputType.TYPE_CLASS_TEXT);
        searchInput.setTextColor(ink);
        searchInput.setHintTextColor(muted);
        searchInput.setBackground(inputBg());
        searchInput.setPadding(dp(12), 0, dp(12), 0);
        panel.addView(searchInput, new LinearLayout.LayoutParams(-1, dp(48)));

        verticalSpinner = new Spinner(this);
        setMargins(verticalSpinner, 0, dp(10), 0, 0);
        panel.addView(verticalSpinner, new LinearLayout.LayoutParams(-1, dp(48)));

        categoryToggleButton = actionButton("Arata categorii", Color.WHITE, deepBlue);
        setMargins(categoryToggleButton, 0, dp(10), 0, 0);
        panel.addView(categoryToggleButton, new LinearLayout.LayoutParams(-1, dp(42)));

        categoryStrip = new LinearLayout(this);
        categoryStrip.setOrientation(LinearLayout.VERTICAL);
        setMargins(categoryStrip, 0, dp(8), 0, 0);
        panel.addView(categoryStrip, new LinearLayout.LayoutParams(-1, -2));
        categoryToggleButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                categoriesVisible = !categoriesVisible;
                renderCategoryStrip();
            }
        });

        autoFilterRow = new LinearLayout(this);
        autoFilterRow.setOrientation(LinearLayout.HORIZONTAL);
        setMargins(autoFilterRow, 0, dp(10), 0, 0);
        panel.addView(autoFilterRow, new LinearLayout.LayoutParams(-1, -2));

        brandSpinner = new Spinner(this);
        autoFilterRow.addView(brandSpinner, new LinearLayout.LayoutParams(0, dp(48), 1));

        modelSpinner = new Spinner(this);
        setMargins(modelSpinner, dp(8), 0, 0, 0);
        autoFilterRow.addView(modelSpinner, new LinearLayout.LayoutParams(0, dp(48), 1));
        updateAutoFilterVisibility();

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        setMargins(actions, 0, dp(10), 0, 0);
        panel.addView(actions, new LinearLayout.LayoutParams(-1, -2));

        Button searchButton = actionButton("Cauta", blue, Color.WHITE);
        actions.addView(searchButton, new LinearLayout.LayoutParams(0, dp(48), 1));

        Button resetButton = actionButton("Reset", Color.WHITE, deepBlue);
        setMargins(resetButton, dp(8), 0, 0, 0);
        actions.addView(resetButton, new LinearLayout.LayoutParams(0, dp(48), 1));

        searchButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                loadListings();
            }
        });
        resetButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                searchInput.setText("");
                selectedVertical = "";
                selectedBrand = "";
                selectedModel = "";
                if (verticalSpinner.getAdapter() != null) verticalSpinner.setSelection(0);
                if (brandSpinner.getAdapter() != null) brandSpinner.setSelection(0);
                updateAutoFilterVisibility();
                loadListings();
            }
        });
        searchInput.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(TextView view, int actionId, android.view.KeyEvent event) {
                if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                    loadListings();
                    return true;
                }
                return false;
            }
        });
    }

    private void loadConfig() {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject json = getJson(BASE_URL + "/api/e-marqet/config");
                    brandModels = json.optJSONObject("auto_brand_models");
                    if (brandModels == null) brandModels = new JSONObject();
                    final ArrayList<Vertical> verticals = new ArrayList<Vertical>();
                    JSONArray verticalRows = json.optJSONArray("verticals");
                    if (verticalRows != null) {
                        for (int i = 0; i < verticalRows.length(); i++) {
                            JSONObject item = verticalRows.optJSONObject(i);
                            if (item != null && item.optString("code", "").length() > 0) {
                                verticals.add(Vertical.fromJson(item));
                            }
                        }
                    }
                    final ArrayList<String> brands = new ArrayList<String>();
                    Iterator<String> keys = brandModels.keys();
                    while (keys.hasNext()) brands.add(keys.next());
                    Collections.sort(brands);
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            populateVerticalSpinner(verticals);
                            renderCategoryStrip();
                            populateBrandSpinner(brands);
                        }
                    });
                } catch (final Exception error) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Nu pot incarca marcile auto: " + error.getMessage());
                        }
                    });
                }
            }
        });
    }

    private void populateVerticalSpinner(List<Vertical> verticals) {
        verticalOptions.clear();
        verticalOptions.add(new Vertical("", "Toate categoriile"));
        verticalOptions.addAll(verticals);
        ArrayList<String> labels = new ArrayList<String>();
        int selectedIndex = 0;
        for (int i = 0; i < verticalOptions.size(); i++) {
            Vertical vertical = verticalOptions.get(i);
            labels.add(vertical.name);
            if (vertical.code.equals(selectedVertical)) selectedIndex = i;
        }
        verticalSpinner.setAdapter(spinnerAdapter(labels));
        verticalSpinner.setSelection(selectedIndex);
        verticalSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                selectedVertical = position <= 0 ? "" : verticalOptions.get(position).code;
                if (!isAutoSelected()) {
                    selectedBrand = "";
                    selectedModel = "";
                    if (brandSpinner.getAdapter() != null) brandSpinner.setSelection(0);
                }
                updateAutoFilterVisibility();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
                selectedVertical = "";
                updateAutoFilterVisibility();
            }
        });
        updateAutoFilterVisibility();
        renderCategoryStrip();
    }

    private void populateBrandSpinner(List<String> brands) {
        brandOptions.clear();
        brandOptions.add("Toate marcile");
        brandOptions.addAll(brands);
        ArrayAdapter<String> adapter = spinnerAdapter(brandOptions);
        brandSpinner.setAdapter(adapter);
        brandSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                selectedBrand = position <= 0 ? "" : brandOptions.get(position);
                selectedModel = "";
                populateModelSpinner(selectedBrand);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
                selectedBrand = "";
                populateModelSpinner("");
            }
        });
        populateModelSpinner("");
    }

    private void populateModelSpinner(String brand) {
        modelOptions.clear();
        modelOptions.add("Toate modelele");
        JSONArray models = brandModels.optJSONArray(brand);
        if (models != null) {
            for (int i = 0; i < models.length(); i++) {
                String model = models.optString(i, "");
                if (model.length() > 0) modelOptions.add(model);
            }
        }
        ArrayAdapter<String> adapter = spinnerAdapter(modelOptions);
        modelSpinner.setAdapter(adapter);
        modelSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                selectedModel = position <= 0 ? "" : modelOptions.get(position);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
                selectedModel = "";
            }
        });
    }

    private boolean isAutoSelected() {
        return "auto".equals(selectedVertical);
    }

    private void updateAutoFilterVisibility() {
        if (autoFilterRow == null) return;
        autoFilterRow.setVisibility(isAutoSelected() ? View.VISIBLE : View.GONE);
    }

    private void renderCategoryStrip() {
        if (categoryStrip == null) return;
        if (categoryToggleButton != null) {
            categoryToggleButton.setText(categoriesVisible ? "Ascunde categorii" : "Arata categorii");
        }
        categoryStrip.setVisibility(categoriesVisible ? View.VISIBLE : View.GONE);
        categoryStrip.removeAllViews();
        if (!categoriesVisible) return;
        LinearLayout row = null;
        for (int i = 0; i < verticalOptions.size(); i++) {
            final Vertical vertical = verticalOptions.get(i);
            boolean selected = selectedVertical.equals(vertical.code) || (selectedVertical.length() == 0 && vertical.code.length() == 0);
            TextView category = categoryButton(vertical, selected);
            if (i % 2 == 0) {
                row = new LinearLayout(this);
                row.setOrientation(LinearLayout.HORIZONTAL);
                setMargins(row, 0, i == 0 ? 0 : dp(8), 0, 0);
                categoryStrip.addView(row, new LinearLayout.LayoutParams(-1, -2));
            }
            setMargins(category, i % 2 == 0 ? 0 : dp(8), 0, 0, 0);
            row.addView(category, new LinearLayout.LayoutParams(0, dp(82), 1));
            category.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    selectedVertical = vertical.code;
                    selectedBrand = "";
                    selectedModel = "";
                    if (verticalSpinner.getAdapter() != null) {
                        for (int j = 0; j < verticalOptions.size(); j++) {
                            if (verticalOptions.get(j).code.equals(selectedVertical)) {
                                verticalSpinner.setSelection(j);
                                break;
                            }
                        }
                    }
                    updateAutoFilterVisibility();
                    categoriesVisible = false;
                    renderCategoryStrip();
                    loadListings();
                }
            });
        }
        if (verticalOptions.size() % 2 == 1 && categoryStrip.getChildCount() > 0) {
            LinearLayout lastRow = (LinearLayout) categoryStrip.getChildAt(categoryStrip.getChildCount() - 1);
            TextView spacer = new TextView(this);
            setMargins(spacer, dp(8), 0, 0, 0);
            lastRow.addView(spacer, new LinearLayout.LayoutParams(0, dp(82), 1));
        }
    }

    private ArrayAdapter<String> spinnerAdapter(ArrayList<String> items) {
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this, android.R.layout.simple_spinner_item, items);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        return adapter;
    }

    private void loadListings() {
        if (statusText != null) statusText.setText("Se incarca anunturile...");
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    StringBuilder url = new StringBuilder(BASE_URL + "/api/e-marqet/listings?mobile=1");
                    appendQuery(url, "q", searchInput == null ? "" : searchInput.getText().toString());
                    appendQuery(url, "vertical", selectedVertical);
                    if (isAutoSelected()) {
                        appendQuery(url, "brand", selectedBrand);
                        appendQuery(url, "model", selectedModel);
                    }
                    JSONObject json = getJson(url.toString());
                    JSONArray rows = json.optJSONArray("listings");
                    final ArrayList<Listing> parsed = new ArrayList<Listing>();
                    if (rows != null) {
                        for (int i = 0; i < rows.length(); i++) {
                            JSONObject item = rows.optJSONObject(i);
                            if (item != null) parsed.add(Listing.fromJson(item));
                        }
                    }
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            listings.clear();
                            listings.addAll(parsed);
                            renderListings();
                        }
                    });
                } catch (final Exception error) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (statusText != null) statusText.setText("Nu am putut incarca anunturile.");
                            toast(error.getMessage());
                        }
                    });
                }
            }
        });
    }

    private void renderListings() {
        listContainer.removeAllViews();
        statusText.setText(listings.size() + " anunturi gasite");
        if (listings.isEmpty()) {
            TextView empty = text("Nu exista anunturi pentru filtrul ales.", 16, muted, Typeface.BOLD);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(16), dp(32), dp(16), dp(32));
            empty.setBackground(cardBg(Color.WHITE));
            listContainer.addView(empty, new LinearLayout.LayoutParams(-1, -2));
            return;
        }
        for (int i = 0; i < listings.size(); i++) {
            listContainer.addView(listingCard(listings.get(i)));
        }
    }

    private View listingCard(final Listing listing) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(0, 0, 0, dp(12));
        card.setBackground(cardBg(Color.WHITE));
        setMargins(card, 0, 0, 0, dp(14));

        FrameLayout media = new FrameLayout(this);
        card.addView(media, new LinearLayout.LayoutParams(-1, dp(210)));

        ImageView image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setBackgroundColor(Color.rgb(224, 242, 254));
        media.addView(image, new FrameLayout.LayoutParams(-1, -1));
        loadImage(listing.primaryImage, image);
        if (listing.isPromoted) {
            TextView badge = premiumBadge();
            FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(dp(92), dp(44), Gravity.TOP | Gravity.LEFT);
            badgeParams.setMargins(dp(10), dp(10), 0, 0);
            media.addView(badge, badgeParams);
        }

        LinearLayout meta = new LinearLayout(this);
        meta.setOrientation(LinearLayout.VERTICAL);
        meta.setPadding(dp(14), dp(12), dp(14), 0);
        card.addView(meta, new LinearLayout.LayoutParams(-1, -2));

        TextView title = text(listing.title, 22, ink, Typeface.BOLD);
        title.setMaxLines(2);
        meta.addView(title);
        meta.addView(text(listing.priceText(), 20, deepBlue, Typeface.BOLD));
        meta.addView(text(listing.location, 15, muted, Typeface.NORMAL));
        LinearLayout chips = new LinearLayout(this);
        chips.setOrientation(LinearLayout.HORIZONTAL);
        setMargins(chips, 0, dp(8), 0, 0);
        meta.addView(chips, new LinearLayout.LayoutParams(-1, -2));
        if (listing.verticalName.length() > 0) addChip(chips, listing.verticalName);
        if (listing.partnerName.length() > 0) {
            addChip(chips, listing.partnerName);
        }

        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                renderDetail(listing);
            }
        });
        return card;
    }

    private void renderDetail(Listing listing) {
        renderDetail(listing, true);
    }

    private void renderDetail(Listing listing, boolean resetImage) {
        selectedListing = listing;
        if (resetImage) selectedImageIndex = 0;

        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(surface);
        setContentView(root);

        root.addView(topBar("e-Marqet", "Detalii anunt"));

        ScrollView scroll = new ScrollView(this);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(14), dp(14), dp(14), dp(18));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -2));

        Button back = actionButton("Inapoi la anunturi", Color.WHITE, deepBlue);
        content.addView(back, new LinearLayout.LayoutParams(-1, dp(48)));
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                renderHome();
                loadConfig();
                loadListings();
            }
        });

        renderListingDetailBody();
    }

    private void renderListingDetailBody() {
        if (selectedListing == null) return;

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(12), dp(12), dp(12), dp(12));
        card.setBackground(cardBg(Color.WHITE));
        setMargins(card, 0, dp(12), 0, 0);
        content.addView(card, new LinearLayout.LayoutParams(-1, -2));

        FrameLayout media = new FrameLayout(this);
        card.addView(media, new LinearLayout.LayoutParams(-1, dp(260)));

        ImageView image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setBackgroundColor(Color.rgb(224, 242, 254));
        media.addView(image, new FrameLayout.LayoutParams(-1, -1));
        loadImage(selectedListing.imageAt(selectedImageIndex), image);
        if (selectedListing.isPromoted) {
            TextView badge = premiumBadge();
            FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(dp(92), dp(44), Gravity.TOP | Gravity.LEFT);
            badgeParams.setMargins(dp(10), dp(10), 0, 0);
            media.addView(badge, badgeParams);
        }

        if (selectedListing.imageUrls.size() > 1) {
            LinearLayout gallery = new LinearLayout(this);
            gallery.setOrientation(LinearLayout.HORIZONTAL);
            setMargins(gallery, 0, dp(10), 0, 0);
            card.addView(gallery, new LinearLayout.LayoutParams(-1, -2));

            Button prev = actionButton("Poza -", Color.WHITE, deepBlue);
            Button next = actionButton("Poza +", Color.WHITE, deepBlue);
            gallery.addView(prev, new LinearLayout.LayoutParams(0, dp(44), 1));
            setMargins(next, dp(8), 0, 0, 0);
            gallery.addView(next, new LinearLayout.LayoutParams(0, dp(44), 1));

            prev.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    selectedImageIndex = selectedImageIndex <= 0 ? selectedListing.imageUrls.size() - 1 : selectedImageIndex - 1;
                    renderDetail(selectedListing, false);
                }
            });
            next.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View view) {
                    selectedImageIndex = (selectedImageIndex + 1) % selectedListing.imageUrls.size();
                    renderDetail(selectedListing, false);
                }
            });
        }

        TextView title = text(selectedListing.title, 24, ink, Typeface.BOLD);
        setMargins(title, 0, dp(14), 0, 0);
        card.addView(title);
        card.addView(text(selectedListing.priceText(), 22, deepBlue, Typeface.BOLD));
        if (selectedListing.verticalName.length() > 0) {
            card.addView(text(selectedListing.verticalName, 15, deepBlue, Typeface.BOLD));
        }
        card.addView(text(selectedListing.location, 15, muted, Typeface.NORMAL));

        LinearLayout specs = new LinearLayout(this);
        specs.setOrientation(LinearLayout.VERTICAL);
        specs.setPadding(0, dp(10), 0, dp(2));
        card.addView(specs);
        if ("auto".equals(selectedListing.verticalCode)) {
            addSpec(specs, "Marca", selectedListing.metadata.optString("brand", ""));
            addSpec(specs, "Model", selectedListing.metadata.optString("model", ""));
            addSpec(specs, "An", selectedListing.metadata.optString("year", ""));
            addSpec(specs, "Km", selectedListing.metadata.optString("mileage", ""));
            addSpec(specs, "Combustibil", selectedListing.metadata.optString("fuel", ""));
            addSpec(specs, "Cutie", selectedListing.metadata.optString("transmission", ""));
        } else {
            addGenericSpecs(specs, selectedListing.metadata);
        }

        if (selectedListing.description.length() > 0) {
            TextView descTitle = text("Descriere", 18, ink, Typeface.BOLD);
            setMargins(descTitle, 0, dp(12), 0, 0);
            card.addView(descTitle);
            TextView desc = text(selectedListing.description, 15, muted, Typeface.NORMAL);
            desc.setLineSpacing(2, 1.05f);
            card.addView(desc);
        }

        renderPartnerBlock(card, selectedListing);
    }

    private void renderPartnerBlock(LinearLayout parent, final Listing listing) {
        LinearLayout partner = new LinearLayout(this);
        partner.setOrientation(LinearLayout.VERTICAL);
        partner.setPadding(dp(12), dp(12), dp(12), dp(12));
        partner.setBackground(cardBg(Color.rgb(240, 249, 255)));
        setMargins(partner, 0, dp(14), 0, 0);
        parent.addView(partner, new LinearLayout.LayoutParams(-1, -2));

        partner.addView(text(listing.partnerName.length() > 0 ? listing.partnerName : listing.ownerName, 18, ink, Typeface.BOLD));
        if (listing.partnerPhone.length() > 0) partner.addView(text("Telefon: " + listing.partnerPhone, 14, muted, Typeface.NORMAL));
        if (listing.partnerEmail.length() > 0) partner.addView(text("Email: " + listing.partnerEmail, 14, muted, Typeface.NORMAL));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.VERTICAL);
        setMargins(actions, 0, dp(12), 0, 0);
        partner.addView(actions);

        Button contact = actionButton("Trimite mesaj", blue, Color.WHITE);
        actions.addView(contact, new LinearLayout.LayoutParams(-1, dp(48)));
        contact.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                showContactDialog(listing);
            }
        });

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        setMargins(row, 0, dp(8), 0, 0);
        actions.addView(row, new LinearLayout.LayoutParams(-1, -2));

        addIntentButton(row, "Telefon", listing.partnerPhone.length() > 0, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openUri("tel:" + listing.partnerPhone);
            }
        });
        addIntentButton(row, "WhatsApp", listing.partnerPhone.length() > 0, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                String digits = listing.partnerPhone.replaceAll("[^0-9+]", "");
                openUri("https://wa.me/" + digits.replace("+", "") + "?text=" + uri("Buna, ma intereseaza anuntul " + listing.title + " de pe e-Marqet: " + listing.publicUrl));
            }
        });
        addIntentButton(row, "Email", listing.partnerEmail.length() > 0, new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                openUri("mailto:" + listing.partnerEmail + "?subject=" + uri("Cerere e-Marqet: " + listing.title) + "&body=" + uri("Buna,\n\nMa intereseaza anuntul de pe e-Marqet:\n" + listing.publicUrl));
            }
        });
    }

    private void addChip(LinearLayout row, String label) {
        TextView chip = text(label, 13, deepBlue, Typeface.BOLD);
        chip.setPadding(dp(10), dp(5), dp(10), dp(5));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(224, 242, 254));
        bg.setCornerRadius(dp(999));
        bg.setStroke(dp(1), border);
        chip.setBackground(bg);
        setMargins(chip, row.getChildCount() == 0 ? 0 : dp(8), 0, 0, 0);
        row.addView(chip, new LinearLayout.LayoutParams(-2, -2));
    }

    private TextView premiumBadge() {
        TextView badge = text("👑\nPromovat", 11, Color.rgb(59, 37, 0), Typeface.BOLD);
        badge.setGravity(Gravity.CENTER);
        badge.setMaxLines(2);
        badge.setPadding(dp(6), dp(2), dp(6), dp(3));
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[] {
            Color.rgb(254, 240, 138),
            Color.rgb(251, 191, 36),
            Color.rgb(217, 119, 6)
        });
        bg.setCornerRadius(dp(8));
        bg.setStroke(dp(1), Color.rgb(146, 64, 14));
        badge.setBackground(bg);
        return badge;
    }

    private void addIntentButton(LinearLayout row, String label, boolean enabled, View.OnClickListener listener) {
        Button button = actionButton(label, enabled ? Color.WHITE : Color.rgb(226, 232, 240), enabled ? deepBlue : muted);
        button.setEnabled(enabled);
        setMargins(button, row.getChildCount() == 0 ? 0 : dp(8), 0, 0, 0);
        row.addView(button, new LinearLayout.LayoutParams(0, dp(44), 1));
        button.setOnClickListener(listener);
    }

    private void showContactDialog(final Listing listing) {
        final LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(8), 0, dp(8), 0);

        final EditText name = dialogInput("Nume", InputType.TYPE_CLASS_TEXT);
        final EditText email = dialogInput("Email", InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        final EditText phone = dialogInput("Telefon", InputType.TYPE_CLASS_PHONE);
        final EditText message = dialogInput("Mesaj", InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        message.setMinLines(4);
        message.setText("Vreau detalii despre acest anunt.");

        form.addView(name);
        form.addView(email);
        form.addView(phone);
        form.addView(message);

        new AlertDialog.Builder(this)
            .setTitle("Contact partener")
            .setView(form)
            .setNegativeButton("Renunta", null)
            .setPositiveButton("Trimite", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    sendLead(listing, name.getText().toString(), email.getText().toString(), phone.getText().toString(), message.getText().toString());
                }
            })
            .show();
    }

    private EditText dialogInput(String hint, int inputType) {
        EditText input = new EditText(this);
        input.setHint(hint);
        input.setInputType(inputType);
        input.setSingleLine((inputType & InputType.TYPE_TEXT_FLAG_MULTI_LINE) == 0);
        input.setTextColor(ink);
        input.setHintTextColor(muted);
        input.setPadding(dp(8), dp(4), dp(8), dp(4));
        return input;
    }

    private void sendLead(final Listing listing, final String name, final String email, final String phone, final String message) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("listing_id", listing.id);
                    body.put("requester_name", name);
                    body.put("requester_email", email);
                    body.put("requester_phone", phone);
                    body.put("message", message);
                    postJson(BASE_URL + "/api/e-marqet/leads", body);
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Mesaj trimis catre partener.");
                        }
                    });
                } catch (final Exception error) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Nu s-a trimis: " + error.getMessage());
                        }
                    });
                }
            }
        });
    }

    private void renderLogin() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(surface);
        setContentView(root);

        root.addView(topBar("e-Marqet", "Login cont"));

        ScrollView scroll = new ScrollView(this);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(14), dp(14), dp(14), dp(18));
        scroll.addView(form, new ScrollView.LayoutParams(-1, -2));

        final EditText email = new EditText(this);
        email.setHint("Email");
        email.setInputType(InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        email.setSingleLine(true);
        email.setTextColor(ink);
        email.setHintTextColor(muted);
        email.setBackground(inputBg());
        email.setPadding(dp(12), 0, dp(12), 0);
        form.addView(email, new LinearLayout.LayoutParams(-1, dp(48)));

        final EditText password = new EditText(this);
        password.setHint("Parola");
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        password.setSingleLine(true);
        password.setTextColor(ink);
        password.setHintTextColor(muted);
        password.setBackground(inputBg());
        password.setPadding(dp(12), 0, dp(12), 0);
        setMargins(password, 0, dp(10), 0, 0);
        form.addView(password, new LinearLayout.LayoutParams(-1, dp(48)));

        Button login = actionButton("Intra in cont", blue, Color.WHITE);
        setMargins(login, 0, dp(12), 0, 0);
        form.addView(login, new LinearLayout.LayoutParams(-1, dp(48)));

        Button back = actionButton("Inapoi", Color.WHITE, deepBlue);
        setMargins(back, 0, dp(10), 0, 0);
        form.addView(back, new LinearLayout.LayoutParams(-1, dp(48)));

        login.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                loginUser(email.getText().toString(), password.getText().toString());
            }
        });
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                renderHome();
                loadConfig();
                loadListings();
            }
        });
    }

    private void loginUser(final String email, final String password) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject body = new JSONObject();
                    body.put("email", email);
                    body.put("password", password);
                    JSONObject response = postJson(AUTH_LOGIN_URL, body);
                    rememberUser(response.optJSONObject("user"));
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Te-ai autentificat in e-Marqet.");
                            renderHome();
                            loadConfig();
                            loadListings();
                        }
                    });
                } catch (final Exception error) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Login esuat. Verifica emailul si parola.");
                        }
                    });
                }
            }
        });
    }

    private void logoutUser() {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    postJson(AUTH_LOGOUT_URL, new JSONObject());
                } catch (Exception ignored) {
                    // Local logout should still clear the phone session.
                }
                clearUser();
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        toast("Ai iesit din cont.");
                        renderHome();
                        loadConfig();
                        loadListings();
                    }
                });
            }
        });
    }

    private void checkCurrentUser(final boolean announce) {
        if (sessionCookie.length() == 0) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject response = getJson(AUTH_ME_URL);
                    if (response.optBoolean("authenticated", false)) {
                        rememberUser(response.optJSONObject("user"));
                    } else {
                        clearUser();
                    }
                } catch (Exception error) {
                    if (announce) {
                        handler.post(new Runnable() {
                            @Override
                            public void run() {
                                toast("Nu pot verifica sesiunea.");
                            }
                        });
                    }
                }
            }
        });
    }

    private void rememberUser(JSONObject user) {
        if (user == null) return;
        currentUserName = user.optString("display_name", "");
        currentUserEmail = user.optString("email", "");
        prefs().edit()
            .putString("session_cookie", sessionCookie)
            .putString("user_name", currentUserName)
            .putString("user_email", currentUserEmail)
            .apply();
    }

    private void clearUser() {
        sessionCookie = "";
        currentUserName = "";
        currentUserEmail = "";
        prefs().edit().clear().apply();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("emarqet_app", MODE_PRIVATE);
    }

    private void addSpec(LinearLayout parent, String label, String value) {
        if (value == null || value.trim().length() == 0) return;
        TextView row = text(label + ": " + value, 14, muted, Typeface.NORMAL);
        setMargins(row, 0, dp(3), 0, 0);
        parent.addView(row);
    }

    private void addGenericSpecs(LinearLayout parent, JSONObject metadata) {
        if (metadata == null) return;
        Iterator<String> keys = metadata.keys();
        int count = 0;
        while (keys.hasNext() && count < 10) {
            String key = keys.next();
            String value = metadata.optString(key, "");
            if (value == null || value.trim().length() == 0 || value.startsWith("{") || value.startsWith("[")) continue;
            addSpec(parent, labelFromKey(key), value);
            count++;
        }
    }

    private String labelFromKey(String key) {
        String[] parts = (key == null ? "" : key).replace("_", " ").split(" ");
        StringBuilder label = new StringBuilder();
        for (int i = 0; i < parts.length; i++) {
            if (parts[i].length() == 0) continue;
            if (label.length() > 0) label.append(" ");
            label.append(parts[i].substring(0, 1).toUpperCase(Locale.ROOT)).append(parts[i].substring(1));
        }
        return label.length() == 0 ? "Detaliu" : label.toString();
    }

    private LinearLayout topBar(String title, String subtitle) {
        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(16), dp(16), dp(16), dp(14));
        bar.setBackgroundColor(blue);

        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("emarqet_icon", "drawable", getPackageName()));
        logo.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable logoBg = new GradientDrawable();
        logoBg.setColor(Color.TRANSPARENT);
        logoBg.setCornerRadius(dp(12));
        logo.setBackground(logoBg);
        bar.addView(logo, new LinearLayout.LayoutParams(dp(52), dp(52)));

        LinearLayout copy = new LinearLayout(this);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(dp(12), 0, 0, 0);
        bar.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
        copy.addView(text(title, 25, Color.WHITE, Typeface.BOLD));
        copy.addView(text(subtitle, 14, Color.rgb(224, 242, 254), Typeface.NORMAL));
        copy.addView(text("v" + currentVersionName(), 11, Color.rgb(224, 242, 254), Typeface.NORMAL));

        LinearLayout authBox = new LinearLayout(this);
        authBox.setOrientation(LinearLayout.VERTICAL);
        authBox.setGravity(Gravity.CENTER);
        setMargins(authBox, dp(8), 0, 0, 0);
        bar.addView(authBox, new LinearLayout.LayoutParams(dp(158), -2));

        LinearLayout authActions = new LinearLayout(this);
        authActions.setOrientation(LinearLayout.HORIZONTAL);
        authBox.addView(authActions, new LinearLayout.LayoutParams(-1, dp(38)));

        Button update = actionButton("Update", Color.WHITE, deepBlue);
        authActions.addView(update, new LinearLayout.LayoutParams(0, -1, 1));

        Button auth = actionButton(currentUserName.length() > 0 ? "Logout" : "Login", Color.WHITE, deepBlue);
        setMargins(auth, dp(6), 0, 0, 0);
        authActions.addView(auth, new LinearLayout.LayoutParams(0, -1, 1));
        if (currentUserName.length() > 0) {
            TextView userName = text(currentUserName, 11, Color.WHITE, Typeface.BOLD);
            userName.setGravity(Gravity.CENTER);
            userName.setMaxLines(1);
            userName.setEllipsize(TextUtils.TruncateAt.END);
            setMargins(userName, 0, dp(3), 0, 0);
            authBox.addView(userName, new LinearLayout.LayoutParams(-1, -2));
        }
        update.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                checkForUpdates(true);
            }
        });
        auth.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                if (currentUserName.length() > 0) {
                    logoutUser();
                } else {
                    renderLogin();
                }
            }
        });
        return bar;
    }

    private TextView categoryButton(Vertical vertical, boolean selected) {
        TextView view = text(categoryIcon(vertical.code) + "\n" + shortCategoryName(vertical), 13, selected ? Color.WHITE : deepBlue, Typeface.BOLD);
        view.setGravity(Gravity.CENTER);
        view.setMaxLines(2);
        view.setEllipsize(TextUtils.TruncateAt.END);
        view.setPadding(dp(6), dp(6), dp(6), dp(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(selected ? deepBlue : Color.WHITE);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), selected ? deepBlue : border);
        view.setBackground(bg);
        return view;
    }

    private String categoryIcon(String code) {
        if ("auto".equals(code)) return "🚗";
        if ("imobiliare".equals(code)) return "🏠";
        if ("servicii".equals(code)) return "🛠";
        if ("joburi".equals(code)) return "💼";
        if ("turism".equals(code)) return "✈";
        if ("produse".equals(code)) return "🛍";
        if ("jucarii".equals(code)) return "🧸";
        if ("electronice_electrocasnice".equals(code)) return "🔌";
        if ("pc_laptopuri_it".equals(code)) return "💻";
        if ("telefoane_accesorii".equals(code)) return "📱";
        if ("audio_video".equals(code)) return "🎧";
        if ("moda_frumusete".equals(code)) return "👗";
        if ("casa_gradina".equals(code)) return "🌿";
        if ("mama_copilul".equals(code)) return "🍼";
        if ("sport_timp_liber_arta".equals(code)) return "⚽";
        if ("animale_companie".equals(code)) return "🐾";
        if ("agro_industrie".equals(code)) return "🚜";
        if ("echipamente_profesionale".equals(code)) return "⚙";
        if ("inchirieri".equals(code)) return "🔑";
        return "▦";
    }

    private String shortCategoryName(Vertical vertical) {
        String code = vertical.code;
        if (code.length() == 0) return "Toate";
        if ("electronice_electrocasnice".equals(code)) return "Electro";
        if ("pc_laptopuri_it".equals(code)) return "PC / IT";
        if ("telefoane_accesorii".equals(code)) return "Telefoane";
        if ("moda_frumusete".equals(code)) return "Moda";
        if ("casa_gradina".equals(code)) return "Casa";
        if ("mama_copilul".equals(code)) return "Mama";
        if ("sport_timp_liber_arta".equals(code)) return "Sport";
        if ("animale_companie".equals(code)) return "Animale";
        if ("agro_industrie".equals(code)) return "Agro";
        if ("echipamente_profesionale".equals(code)) return "Echipamente";
        if ("inchirieri".equals(code)) return "Inchirieri";
        return vertical.name;
    }

    private TextView text(String value, int sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value == null ? "" : value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.DEFAULT, style);
        view.setIncludeFontPadding(true);
        return view;
    }

    private Button actionButton(String label, int bgColor, int textColor) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(label != null && label.length() > 12 ? 13 : 14);
        button.setTextColor(textColor);
        button.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        button.setAllCaps(false);
        button.setGravity(Gravity.CENTER);
        button.setMaxLines(2);
        button.setEllipsize(TextUtils.TruncateAt.END);
        button.setMinWidth(0);
        button.setMinHeight(0);
        button.setPadding(dp(4), 0, dp(4), 0);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(bgColor);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), bgColor == Color.WHITE ? border : bgColor);
        button.setBackground(bg);
        return button;
    }

    private String currentVersionName() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (PackageManager.NameNotFoundException error) {
            return "";
        }
    }

    private GradientDrawable cardBg(int color) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(color);
        bg.setCornerRadius(dp(12));
        bg.setStroke(dp(1), border);
        return bg;
    }

    private GradientDrawable inputBg() {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.WHITE);
        bg.setCornerRadius(dp(10));
        bg.setStroke(dp(1), border);
        return bg;
    }

    private void setMargins(View view, int left, int top, int right, int bottom) {
        ViewGroup.LayoutParams params = view.getLayoutParams();
        ViewGroup.MarginLayoutParams marginParams;
        if (params instanceof ViewGroup.MarginLayoutParams) {
            marginParams = (ViewGroup.MarginLayoutParams) params;
        } else {
            marginParams = new ViewGroup.MarginLayoutParams(params == null ? -2 : params.width, params == null ? -2 : params.height);
        }
        marginParams.setMargins(left, top, right, bottom);
        view.setLayoutParams(marginParams);
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void appendQuery(StringBuilder url, String key, String value) throws Exception {
        String normalized = value == null ? "" : value.trim();
        if (normalized.length() == 0) return;
        url.append("&").append(URLEncoder.encode(key, "UTF-8")).append("=").append(URLEncoder.encode(normalized, "UTF-8"));
    }

    private void checkForUpdates(final boolean manual) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    final JSONObject update = getJson(UPDATE_URL);
                    final int remoteVersionCode = update.optInt("version_code", 0);
                    final int currentVersionCode = currentVersionCode();
                    if (remoteVersionCode <= currentVersionCode) {
                        if (manual) {
                            handler.post(new Runnable() {
                                @Override
                                public void run() {
                                    toast("Ai ultima versiune e-Marqet.");
                                }
                            });
                        }
                        return;
                    }
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (manual) {
                                showUpdateDialog(update);
                            } else {
                                startAutomaticUpdate(update, remoteVersionCode);
                            }
                        }
                    });
                } catch (final Exception error) {
                    if (manual) {
                        handler.post(new Runnable() {
                            @Override
                            public void run() {
                                toast("Nu pot verifica update-ul: " + error.getMessage());
                            }
                        });
                    }
                }
            }
        });
    }

    private int currentVersionCode() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= 28) return (int) info.getLongVersionCode();
            return info.versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return 0;
        }
    }

    private void showUpdateDialog(final JSONObject update) {
        final String versionName = update.optString("version_name", "noua");
        final String notes = update.optString("notes", "Actualizare disponibila.");
        final String apkUrl = update.optString("apk_url", BASE_URL + "/mobile/emarqet/emarqet-native-latest.apk");
        new AlertDialog.Builder(this)
            .setTitle("Update e-Marqet " + versionName)
            .setMessage(notes + "\n\nAplicatia descarca update-ul si Android iti va cere confirmarea instalarii.")
            .setNegativeButton("Mai tarziu", null)
            .setPositiveButton("Actualizeaza", new DialogInterface.OnClickListener() {
                @Override
                public void onClick(DialogInterface dialog, int which) {
                    prepareUpdateInstall(apkUrl);
                }
            })
            .show();
    }

    private void startAutomaticUpdate(final JSONObject update, int remoteVersionCode) {
        if (remoteVersionCode <= 0 || autoUpdateStartedVersionCode == remoteVersionCode) return;
        autoUpdateStartedVersionCode = remoteVersionCode;
        final String versionName = update.optString("version_name", "noua");
        final String apkUrl = update.optString("apk_url", BASE_URL + "/mobile/emarqet/emarqet-native-latest.apk");
        toast("Am gasit e-Marqet " + versionName + ". Pregatesc update-ul...");
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                prepareUpdateInstall(apkUrl);
            }
        }, 900);
    }

    private void prepareUpdateInstall(String apkUrl) {
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingUpdateUrl = apkUrl;
            toast("Permite instalarea din aceasta sursa, apoi revino in e-Marqet.");
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getPackageName())
            );
            try {
                startActivityForResult(intent, REQUEST_UNKNOWN_APP_SOURCES);
            } catch (Exception error) {
                openExternalUpdateUrl(apkUrl);
            }
            return;
        }
        downloadAndInstallUpdate(apkUrl);
    }

    private void downloadAndInstallUpdate(final String apkUrl) {
        toast("Descarc update-ul e-Marqet...");
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    File updateDir = new File(getCacheDir(), "updates");
                    if (!updateDir.exists()) updateDir.mkdirs();
                    File apkFile = new File(updateDir, UpdateFileProvider.FILE_NAME);
                    HttpURLConnection connection = (HttpURLConnection) new URL(apkUrl).openConnection();
                    connection.setConnectTimeout(12000);
                    connection.setReadTimeout(60000);
                    connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
                    int code = connection.getResponseCode();
                    if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
                    InputStream input = connection.getInputStream();
                    FileOutputStream output = new FileOutputStream(apkFile);
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                    }
                    output.flush();
                    output.close();
                    input.close();
                    connection.disconnect();
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            openDownloadedUpdate();
                        }
                    });
                } catch (final Exception error) {
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            toast("Update-ul nu s-a descarcat: " + error.getMessage());
                        }
                    });
                }
            }
        });
    }

    private void openDownloadedUpdate() {
        Uri uri = Uri.parse("content://" + UpdateFileProvider.AUTHORITY + "/" + UpdateFileProvider.FILE_NAME);
        Intent intent = new Intent(Build.VERSION.SDK_INT >= 14 ? Intent.ACTION_INSTALL_PACKAGE : Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.setClipData(ClipData.newUri(getContentResolver(), UpdateFileProvider.FILE_NAME, uri));
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
        intent.putExtra(Intent.EXTRA_RETURN_RESULT, false);
        try {
            startActivity(intent);
        } catch (Exception error) {
            toast("Nu pot porni installerul Android. Deschid descarcarea manuala.");
            openExternalUpdateUrl(BASE_URL + "/mobile/emarqet/emarqet-android-latest.apk");
        }
    }

    private void openExternalUpdateUrl(String apkUrl) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception error) {
            toast("Deschide manual: " + apkUrl);
        }
    }

    private JSONObject getJson(String endpoint) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(18000);
        connection.setRequestMethod("GET");
        connection.setRequestProperty("Accept", "application/json");
        applySessionCookie(connection);
        int code = connection.getResponseCode();
        captureSessionCookie(connection);
        InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readStream(stream);
        connection.disconnect();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        return new JSONObject(body);
    }

    private JSONObject postJson(String endpoint, JSONObject payload) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(18000);
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        applySessionCookie(connection);
        OutputStream out = connection.getOutputStream();
        out.write(payload.toString().getBytes("UTF-8"));
        out.close();
        int code = connection.getResponseCode();
        captureSessionCookie(connection);
        InputStream stream = code >= 200 && code < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readStream(stream);
        connection.disconnect();
        if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
        return new JSONObject(body);
    }

    private void applySessionCookie(HttpURLConnection connection) {
        if (sessionCookie.length() > 0) {
            connection.setRequestProperty("Cookie", sessionCookie);
        }
    }

    private void captureSessionCookie(HttpURLConnection connection) {
        Map<String, List<String>> headers = connection.getHeaderFields();
        if (headers == null) return;
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey() == null || !"set-cookie".equals(entry.getKey().toLowerCase(Locale.ROOT))) continue;
            for (String header : entry.getValue()) {
                String value = header == null ? "" : header;
                int semicolon = value.indexOf(';');
                String cookie = semicolon >= 0 ? value.substring(0, semicolon) : value;
                if (cookie.contains("minicrm.sid=") || cookie.contains("connect.sid=") || cookie.contains("sid=")) {
                    sessionCookie = cookie;
                    prefs().edit().putString("session_cookie", sessionCookie).apply();
                    return;
                }
            }
        }
    }

    private String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
        StringBuilder builder = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) builder.append(line);
        reader.close();
        return builder.toString();
    }

    private void loadImage(final String imageUrl, final ImageView view) {
        if (imageUrl == null || imageUrl.length() == 0) return;
        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    HttpURLConnection connection = (HttpURLConnection) new URL(imageUrl).openConnection();
                    connection.setConnectTimeout(10000);
                    connection.setReadTimeout(16000);
                    InputStream input = connection.getInputStream();
                    ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                    byte[] bytes = new byte[8192];
                    int read;
                    while ((read = input.read(bytes)) != -1) buffer.write(bytes, 0, read);
                    input.close();
                    connection.disconnect();
                    byte[] data = buffer.toByteArray();
                    Bitmap bitmap = BitmapFactory.decodeByteArray(data, 0, data.length);
                    bitmap = rotateFromExif(data, bitmap);
                    if (bitmap == null) return;
                    final Bitmap readyBitmap = bitmap;
                    handler.post(new Runnable() {
                        @Override
                        public void run() {
                            view.setImageBitmap(readyBitmap);
                        }
                    });
                } catch (Exception ignored) {
                    // Image loading must not block listing navigation.
                }
            }
        });
    }

    private Bitmap rotateFromExif(byte[] data, Bitmap bitmap) {
        if (bitmap == null || data == null || Build.VERSION.SDK_INT < 24) return bitmap;
        try {
            ExifInterface exif = new ExifInterface(new ByteArrayInputStream(data));
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            int degrees = 0;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) degrees = 90;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_180) degrees = 180;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_270) degrees = 270;
            if (degrees == 0) return bitmap;
            Matrix matrix = new Matrix();
            matrix.postRotate(degrees);
            Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            if (rotated != bitmap) bitmap.recycle();
            return rotated;
        } catch (Exception ignored) {
            return bitmap;
        }
    }

    private void openUri(String value) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(value)));
        } catch (Exception error) {
            toast("Nu pot deschide aplicatia pentru aceasta actiune.");
        }
    }

    private String uri(String value) {
        return Uri.encode(value == null ? "" : value);
    }

    private void toast(String value) {
        Toast.makeText(this, value, Toast.LENGTH_LONG).show();
    }

    private static class Listing {
        int id;
        String code = "";
        String title = "";
        String description = "";
        String ownerName = "";
        String ownerEmail = "";
        String ownerPhone = "";
        String location = "";
        String verticalCode = "";
        String verticalName = "";
        double priceAmount = 0;
        String priceCurrency = "EUR";
        String primaryImage = "";
        String publicUrl = "";
        String partnerName = "";
        String partnerEmail = "";
        String partnerPhone = "";
        String partnerWebsite = "";
        boolean isPromoted = false;
        JSONObject metadata = new JSONObject();
        ArrayList<String> imageUrls = new ArrayList<String>();

        static Listing fromJson(JSONObject json) {
            Listing listing = new Listing();
            listing.id = json.optInt("id", 0);
            listing.code = json.optString("code", "");
            listing.title = json.optString("title", "Anunt e-Marqet");
            listing.description = json.optString("description", "");
            listing.ownerName = json.optString("owner_name", "");
            listing.ownerEmail = json.optString("owner_email", "");
            listing.ownerPhone = json.optString("owner_phone", "");
            listing.location = json.optString("location", "");
            JSONObject vertical = json.optJSONObject("vertical");
            if (vertical != null) {
                listing.verticalCode = vertical.optString("code", "");
                listing.verticalName = vertical.optString("name", "");
            }
            listing.priceAmount = json.optDouble("price_amount", 0);
            listing.priceCurrency = json.optString("price_currency", "EUR");
            listing.primaryImage = json.optString("primary_image_url", "");
            listing.publicUrl = json.optString("public_url", json.optString("url", ""));
            listing.isPromoted = json.optBoolean("is_promoted", false);
            JSONObject partner = json.optJSONObject("partner");
            if (partner != null) {
                listing.partnerName = partner.optString("name", "");
                listing.partnerEmail = partner.optString("email", "");
                listing.partnerPhone = partner.optString("phone", "");
                listing.partnerWebsite = partner.optString("website", "");
            }
            if (listing.partnerName.length() == 0) listing.partnerName = listing.ownerName;
            if (listing.partnerEmail.length() == 0) listing.partnerEmail = listing.ownerEmail;
            if (listing.partnerPhone.length() == 0) listing.partnerPhone = listing.ownerPhone;
            JSONObject metadataJson = json.optJSONObject("metadata");
            if (metadataJson != null) listing.metadata = metadataJson;
            JSONArray images = json.optJSONArray("image_urls");
            if (images != null) {
                for (int i = 0; i < images.length(); i++) {
                    String url = images.optString(i, "");
                    if (url.length() > 0 && !listing.imageUrls.contains(url)) listing.imageUrls.add(url);
                }
            }
            if (listing.primaryImage.length() > 0 && !listing.imageUrls.contains(listing.primaryImage)) {
                listing.imageUrls.add(0, listing.primaryImage);
            }
            return listing;
        }

        String imageAt(int index) {
            if (imageUrls.isEmpty()) return primaryImage;
            int safeIndex = Math.max(0, Math.min(index, imageUrls.size() - 1));
            return imageUrls.get(safeIndex);
        }

        String priceText() {
            if (priceAmount <= 0) return "Pret la cerere";
            NumberFormat format = NumberFormat.getNumberInstance(new Locale("ro", "RO"));
            format.setMaximumFractionDigits(0);
            return format.format(priceAmount) + " " + priceCurrency;
        }
    }

    private static class Vertical {
        String code = "";
        String name = "";

        Vertical(String code, String name) {
            this.code = code == null ? "" : code;
            this.name = name == null || name.length() == 0 ? this.code : name;
        }

        static Vertical fromJson(JSONObject json) {
            return new Vertical(json.optString("code", ""), json.optString("name", ""));
        }
    }
}
